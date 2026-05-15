using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using DainnUser.Core.Enums;
using DainnUser.Core.Interfaces.Services;
using DainnUser.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using EmailAttachment = DainnUser.Core.Interfaces.Services.EmailAttachment;

namespace Mindlex.Services;

public sealed class Sr2DataRetentionService
{
    public const string PartialDeleteMarker = "sr2_partial_delete";
    public const string TombstoneEmailSuffix = "@mindlex.deleted";
    public const int RetentionYears = 12;

    private readonly DainnUserDbContext _userDb;
    private readonly IActivityService _activity;
    private readonly ISessionService _sessions;
    private readonly IUserManagementService _users;
    private readonly IEmailService _email;
    private readonly ILogger<Sr2DataRetentionService> _logger;

    public Sr2DataRetentionService(
        DainnUserDbContext userDb,
        IActivityService activity,
        ISessionService sessions,
        IUserManagementService users,
        IEmailService email,
        ILogger<Sr2DataRetentionService> logger)
    {
        _userDb = userDb;
        _activity = activity;
        _sessions = sessions;
        _users = users;
        _email = email;
        _logger = logger;
    }

    public async Task ApplyPartialDeleteAsync(Guid userId, string source, CancellationToken ct)
    {
        var user = await _userDb.Users
            .Include(u => u.Profile)
            .FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return;
        if (user.Email.EndsWith(TombstoneEmailSuffix, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogDebug("User {UserId} already tombstoned; skipping partial-delete.", userId);
            return;
        }

        var originalEmail = user.Email;
        var fullName = user.Profile?.DisplayName ?? user.Username;
        var retentionExpiresAt = DateTime.UtcNow.AddYears(RetentionYears);

        var snapshot = JsonSerializer.Serialize(new
        {
            action = PartialDeleteMarker,
            source,
            timestamp = DateTime.UtcNow,
            retentionExpiresAt,
            originalEmail,
            fullName
        });

        await _activity.LogActivityAsync(
            userId,
            ActivityType.AccountDeactivated,
            $"Partial deletion under SR2 data retention policy ({source}). Retained until {retentionExpiresAt:yyyy-MM-dd}.",
            ipAddress: string.Empty,
            userAgent: "system:sr2-retention",
            metadata: snapshot,
            ct);

        if (user.Profile is not null)
        {
            user.Profile.DateOfBirth = null;
            user.Profile.AvatarUrl = null;
            user.Profile.Bio = null;
            user.Profile.Gender = null;
            user.Profile.Language = null;
            user.Profile.Timezone = null;
            user.Profile.Website = null;
            user.Profile.FirstName = null;
            user.Profile.LastName = null;
        }

        var emailHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(originalEmail))).Substring(0, 12);
        user.Email = $"retention+{emailHash.ToLowerInvariant()}{TombstoneEmailSuffix}";
        user.Username = user.Email;
        user.PhoneNumber = null;
        user.PhoneVerified = false;
        user.Status = UserStatus.Deactivated;
        user.UpdatedAt = DateTime.UtcNow;

        var addresses = _userDb.UserAddresses.Where(a => a.UserId == userId);
        _userDb.UserAddresses.RemoveRange(addresses);
        var contacts = _userDb.UserContacts.Where(c => c.UserId == userId);
        _userDb.UserContacts.RemoveRange(contacts);
        var loginHistories = _userDb.LoginHistories.Where(l => l.UserId == userId);
        _userDb.LoginHistories.RemoveRange(loginHistories);

        await _userDb.SaveChangesAsync(ct);
        await _sessions.RevokeAllSessionsAsync(userId, ct);

        _logger.LogInformation(
            "Applied SR2 partial-delete to user {UserId} (was {Email}). Retention until {RetentionExpiresAt}.",
            userId, originalEmail, retentionExpiresAt);

        try
        {
            await SendRetentionDeletionEmailAsync(originalEmail, fullName, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send retention-deletion email to {Email}", originalEmail);
        }
    }

    public async Task<int> PurgeExpiredRetentionsAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var candidates = await _userDb.Users
            .Where(u => u.Status == UserStatus.Deactivated
                        && u.Email.EndsWith(TombstoneEmailSuffix))
            .Select(u => u.Id)
            .ToListAsync(ct);

        var purged = 0;
        foreach (var userId in candidates)
        {
            var (activities, _) = await _activity.GetActivityLogAsync(
                userId, pageNumber: 1, pageSize: 200,
                activityType: ActivityType.AccountDeactivated,
                startDate: null, endDate: null, ct);

            var marker = activities
                .Where(a => a.Metadata?.Contains(PartialDeleteMarker, StringComparison.OrdinalIgnoreCase) ?? false)
                .OrderByDescending(a => a.CreatedAt)
                .FirstOrDefault();
            if (marker is null) continue;

            DateTime? retentionExpiresAt = null;
            try
            {
                using var doc = JsonDocument.Parse(marker.Metadata ?? "{}");
                if (doc.RootElement.TryGetProperty("retentionExpiresAt", out var node)
                    && node.TryGetDateTime(out var dt))
                {
                    retentionExpiresAt = dt;
                }
            }
            catch
            {
                // fallback: use marker.CreatedAt + RetentionYears
                retentionExpiresAt = marker.CreatedAt.AddYears(RetentionYears);
            }

            if (retentionExpiresAt is null || retentionExpiresAt.Value > now) continue;

            try
            {
                await _users.DeleteUserAsync(userId, ct);
                _logger.LogInformation("Purged SR2 retention record for user {UserId} after {Years}-year window.", userId, RetentionYears);
                purged++;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to purge SR2 retention record for user {UserId}", userId);
            }
        }

        return purged;
    }

    private async Task SendRetentionDeletionEmailAsync(string toEmail, string? fullName, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(toEmail)) return;
        var displayName = string.IsNullOrWhiteSpace(fullName) ? "there" : fullName;
        var safeName = WebUtility.HtmlEncode(displayName);

        var body = $"""
            <p>Hi {safeName},</p>
            <p>Your Mindlex account has been deleted in line with our data retention policy.</p>
            <p>Because your account has prior paid subscription activity, a minimal record (full name, email, invoices) is retained for {RetentionYears} years to meet tax and VAT compliance obligations. All other personal data — including chat history, drafted documents, uploaded files, and preferences — has been permanently deleted.</p>
            <p>You are welcome to register a new Mindlex account at any time with the same email address. No historical data will be restored.</p>
            <p>Thank you for using Mindlex.</p>
            <p>– The Mindlex Team</p>
            """;

        await _email.SendEmailAsync(
            toEmail, displayName,
            "Your Mindlex account has been deleted",
            body,
            Array.Empty<EmailAttachment>(),
            ct);
    }
}
