using System.Net;
using System.Text.Json;
using DainnStripe.Data;
using DainnStripe.Enums;
using DainnUser.Core.Enums;
using DainnUser.Core.Interfaces.Services;
using DainnUser.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using EmailAttachment = DainnUser.Core.Interfaces.Services.EmailAttachment;

namespace Mindlex.Services;

public sealed class InactiveAccountSweeperService : BackgroundService
{
    private const string WarningMarker = "inactivity_warning_sent";
    private const string DeletedMarker = "inactivity_deletion_completed";

    private readonly IServiceProvider _services;
    private readonly IConfiguration _config;
    private readonly ILogger<InactiveAccountSweeperService> _logger;

    public InactiveAccountSweeperService(
        IServiceProvider services,
        IConfiguration config,
        ILogger<InactiveAccountSweeperService> logger)
    {
        _services = services;
        _config = config;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var intervalHours = _config.GetValue<int?>("Mindlex:Lifecycle:SweepIntervalHours") ?? 24;
        var interval = TimeSpan.FromHours(intervalHours);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunSweepAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "InactiveAccountSweeper sweep cycle failed.");
            }

            try { await Task.Delay(interval, stoppingToken); }
            catch (TaskCanceledException) { break; }
        }
    }

    private async Task RunSweepAsync(CancellationToken ct)
    {
        var warningMonths = _config.GetValue<int?>("Mindlex:Lifecycle:InactivityWarningMonths") ?? 24;
        var graceDays = _config.GetValue<int?>("Mindlex:Lifecycle:DeletionGraceDays") ?? 30;

        var now = DateTime.UtcNow;
        var inactivityThreshold = now.AddMonths(-warningMonths);

        using var scope = _services.CreateScope();
        var sp = scope.ServiceProvider;
        var userDb = sp.GetRequiredService<DainnUserDbContext>();
        var stripeDb = sp.GetRequiredService<DainnStripeDbContext>();
        var activityService = sp.GetRequiredService<IActivityService>();
        var userManagement = sp.GetRequiredService<IUserManagementService>();
        var profiles = sp.GetRequiredService<IProfileService>();
        var email = sp.GetRequiredService<IEmailService>();

        var retention = sp.GetRequiredService<Sr2DataRetentionService>();

        try
        {
            var purged = await retention.PurgeExpiredRetentionsAsync(ct);
            if (purged > 0) _logger.LogInformation("SR2 12-year purge removed {Count} retention records.", purged);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "SR2 retention purge failed.");
        }

        var candidates = await userDb.Users
            .Include(u => u.Profile)
            .Where(u => u.Status != UserStatus.Deactivated)
            .AsNoTracking()
            .ToListAsync(ct);

        foreach (var user in candidates)
        {
            var lastActive = user.LastLoginAt ?? user.CreatedAt;
            if (lastActive > inactivityThreshold) continue;

            var hasPaidHistory = await stripeDb.DainnStripePayments.AnyAsync(p =>
                p.OwnerId == user.Id.ToString()
                && p.Status == DainnStripePaymentStatus.Succeeded, ct);

            if (hasPaidHistory)
            {
                try
                {
                    await retention.ApplyPartialDeleteAsync(user.Id, source: "sr1_inactive_24mo", ct);
                    _logger.LogInformation("SR1+SR2: partial-deleted paid inactive user {UserId}.", user.Id);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to partial-delete paid inactive user {UserId}", user.Id);
                }
                continue;
            }

            var (activities, _) = await activityService.GetActivityLogAsync(
                user.Id, pageNumber: 1, pageSize: 500,
                activityType: ActivityType.AccountDeactivated,
                startDate: null, endDate: null, ct);

            var latestWarning = activities
                .Where(a => (a.Metadata?.Contains(WarningMarker, StringComparison.OrdinalIgnoreCase) ?? false)
                            && a.CreatedAt > lastActive)
                .OrderByDescending(a => a.CreatedAt)
                .FirstOrDefault();

            if (latestWarning is null)
            {
                var deletionDate = now.AddDays(graceDays);
                await SendWarningEmailAsync(email, profiles, user, deletionDate, ct);
                await LogMarkerAsync(activityService, user.Id, WarningMarker, new
                {
                    sentAt = now,
                    scheduledDeletionAt = deletionDate
                }, ct);
                _logger.LogInformation("Sent inactivity warning to user {UserId} (last active {LastActive}).",
                    user.Id, lastActive);
                continue;
            }

            var warningAgeDays = (now - latestWarning.CreatedAt).TotalDays;
            if (warningAgeDays < graceDays) continue;

            try
            {
                await SendDeletionEmailAsync(email, profiles, user, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send deletion email to user {UserId}", user.Id);
            }

            await LogMarkerAsync(activityService, user.Id, DeletedMarker, new
            {
                deletedAt = now,
                reason = "inactive_24mo"
            }, ct);

            try
            {
                await userManagement.DeleteUserAsync(user.Id, ct);
                _logger.LogInformation("Permanently deleted inactive user {UserId} ({Email}).",
                    user.Id, user.Email);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to delete inactive user {UserId}", user.Id);
            }
        }
    }

    private async Task LogMarkerAsync(IActivityService activityService, Guid userId, string marker, object payload, CancellationToken ct)
    {
        var json = JsonSerializer.Serialize(new
        {
            action = marker,
            timestamp = DateTime.UtcNow,
            payload
        });
        try
        {
            await activityService.LogActivityAsync(
                userId,
                ActivityType.AccountDeactivated,
                $"Lifecycle: {marker}",
                ipAddress: string.Empty,
                userAgent: "system:lifecycle-sweeper",
                metadata: json,
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to log lifecycle marker {Marker} for user {UserId}", marker, userId);
        }
    }

    private async Task SendWarningEmailAsync(
        IEmailService email,
        IProfileService profiles,
        DainnUser.Core.Entities.User user,
        DateTime deletionDate,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(user.Email)) return;

        var profile = await profiles.GetProfileAsync(user.Id, ct);
        var fullName = profile?.DisplayName ?? user.Username ?? user.Email;
        var safeName = WebUtility.HtmlEncode(fullName);
        var loginUrl = _config.GetValue<string>("Mindlex:LoginUrl") ?? "https://mindlex.ai/login";
        var safeLoginUrl = WebUtility.HtmlEncode(loginUrl);
        var deletionDateText = deletionDate.ToString("yyyy-MM-dd");

        var body = $"""
            <p>Hi {safeName},</p>
            <p>We noticed that you haven't logged into your Mindlex account in over 24 months.</p>
            <p>To keep our system secure and up-to-date, inactive accounts are automatically removed. Your account is scheduled to be deleted in 30 days if no activity is detected.</p>
            <p>If you'd like to keep your account, simply log in before {deletionDateText}.</p>
            <p><a href="{safeLoginUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Login to Mindlex</a></p>
            <p>If you do not log in within the next 30 days, your account and personal data will be permanently deleted.</p>
            <p>Thank you,<br/>The Mindlex Team</p>
            """;

        await email.SendEmailAsync(
            user.Email, fullName,
            "Your Mindlex account is scheduled for deletion in 30 days",
            body,
            Array.Empty<EmailAttachment>(),
            ct);
    }

    private async Task SendDeletionEmailAsync(
        IEmailService email,
        IProfileService profiles,
        DainnUser.Core.Entities.User user,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(user.Email)) return;

        var profile = await profiles.GetProfileAsync(user.Id, ct);
        var fullName = profile?.DisplayName ?? user.Username ?? user.Email;
        var safeName = WebUtility.HtmlEncode(fullName);

        var body = $"""
            <h2>Your Mindlex account has been permanently deleted</h2>
            <p>Hi {safeName},</p>
            <p>As noted in our previous reminder, your Mindlex account has been inactive for over 24 months. Since no login occurred within the past 30 days, your account has now been permanently deleted as part of our data retention policy.</p>
            <p>If you wish to use Mindlex in the future, you are welcome to create a new account at any time.</p>
            <p>Thank you for using Mindlex.</p>
            <p>– The Mindlex Team</p>
            """;

        await email.SendEmailAsync(
            user.Email, fullName,
            "Your Mindlex account has been deleted due to inactivity",
            body,
            Array.Empty<EmailAttachment>(),
            ct);
    }
}
