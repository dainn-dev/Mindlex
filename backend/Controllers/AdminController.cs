using System.Globalization;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using DainnStripe.Data;
using DainnStripe.Enums;
using DainnUser.Core.Enums;
using DainnUser.Core.Interfaces.Services;
using DainnUser.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyLaw.Data;
using MyLaw.Models;
using MyLaw.Services;
using Stripe;
using EmailAttachment = DainnUser.Core.Interfaces.Services.EmailAttachment;

namespace MyLaw.Controllers;

[ApiController]
[Authorize(Roles = RoleSeeder.AdminRoleName)]
[Route("api/admin")]
public class AdminController : ControllerBase
{
    private readonly IUserManagementService _users;
    private readonly IRoleService _roles;
    private readonly IProfileService _profiles;
    private readonly IAuthenticationService _auth;
    private readonly IActivityService _activity;
    private readonly ISessionService _sessions;
    private readonly IEmailService _email;
    private readonly DainnStripeDbContext _stripeDb;
    private readonly DainnUserDbContext _userDb;
    private readonly MyLawDbContext _mindlexDb;
    private readonly Sr2DataRetentionService _retention;
    private readonly IConfiguration _config;
    private readonly ILogger<AdminController> _logger;

    public AdminController(
        IUserManagementService users,
        IRoleService roles,
        IProfileService profiles,
        IAuthenticationService auth,
        IActivityService activity,
        ISessionService sessions,
        IEmailService email,
        DainnStripeDbContext stripeDb,
        DainnUserDbContext userDb,
        MyLawDbContext mindlexDb,
        Sr2DataRetentionService retention,
        IConfiguration config,
        ILogger<AdminController> logger)
    {
        _users = users;
        _roles = roles;
        _profiles = profiles;
        _auth = auth;
        _activity = activity;
        _sessions = sessions;
        _email = email;
        _stripeDb = stripeDb;
        _userDb = userDb;
        _mindlexDb = mindlexDb;
        _retention = retention;
        _config = config;
        _logger = logger;
    }

    private Guid? AdminUserId
    {
        get
        {
            var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
            return Guid.TryParse(sub, out var id) ? id : null;
        }
    }

    private string? ClientIp => HttpContext.Connection.RemoteIpAddress?.ToString();
    private string? UserAgent => Request.Headers.UserAgent.ToString();

    [HttpGet("users")]
    public async Task<IActionResult> ListUsers(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? search = null,
        [FromQuery] UserStatus? status = null,
        CancellationToken ct = default)
    {
        if (page < 1) page = 1;
        if (pageSize is < 1 or > 200) pageSize = 20;

        var (users, totalCount) = await _users.GetUsersAsync(page, pageSize, search ?? string.Empty, status, ct);
        return Ok(new { users, totalCount, page, pageSize });
    }

    [HttpGet("users/download")]
    public async Task<IActionResult> DownloadAllUsersCsv(CancellationToken ct)
    {
        var users = await _userDb.Users
            .Include(u => u.Profile)
            .Where(u => !u.Email.EndsWith(Sr2DataRetentionService.TombstoneEmailSuffix))
            .AsNoTracking()
            .ToListAsync(ct);

        var userIdStrings = users.Select(u => u.Id.ToString()).ToHashSet();
        var payments = await _stripeDb.DainnStripePayments
            .Where(p => userIdStrings.Contains(p.OwnerId) && p.Status == DainnStripePaymentStatus.Succeeded)
            .AsNoTracking()
            .ToListAsync(ct);

        var subsByOwner = await _stripeDb.DainnStripeSubscriptions
            .Where(s => userIdStrings.Contains(s.OwnerId))
            .AsNoTracking()
            .ToListAsync(ct);
        var latestPriceByOwner = subsByOwner
            .GroupBy(s => s.OwnerId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(s => s.CreatedAt).First().StripePriceId);

        var plans = _config.GetSection("Mindlex:Plans").Get<List<PlanOptions>>() ?? new();
        var priceIdToPlan = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var plan in plans)
        {
            foreach (var priceTier in plan.Pricing.Values)
            {
                if (!string.IsNullOrWhiteSpace(priceTier.StripeMonthlyPriceId))
                    priceIdToPlan[priceTier.StripeMonthlyPriceId!] = plan.DisplayName;
                if (!string.IsNullOrWhiteSpace(priceTier.StripeAnnualPriceId))
                    priceIdToPlan[priceTier.StripeAnnualPriceId!] = plan.DisplayName;
            }
        }

        var paymentsByOwner = payments.GroupBy(p => p.OwnerId).ToDictionary(g => g.Key, g => g.ToList());

        var sb = new StringBuilder();
        sb.AppendLine(string.Join(",",
            "Full Name",
            "Email Address",
            "Date of Birth",
            "Date of Deletion",
            "Payment Dates",
            "Plan Types",
            "Payment Methods",
            "Invoice Amounts"));

        foreach (var user in users)
        {
            var fullName = user.Profile?.DisplayName ?? string.Empty;
            var email = user.Email ?? string.Empty;
            var dob = user.Profile?.DateOfBirth?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? string.Empty;
            var deletionDate = user.Status == UserStatus.Deactivated
                ? user.UpdatedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
                : string.Empty;

            paymentsByOwner.TryGetValue(user.Id.ToString(), out var userPayments);
            var ordered = (userPayments ?? new()).OrderByDescending(p => p.CreatedAt).ToList();

            var paymentDates = string.Join(";",
                ordered.Select(p => p.CreatedAt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)));

            var planTypes = string.Join(";", ordered.Select(_ =>
                latestPriceByOwner.TryGetValue(user.Id.ToString(), out var priceId) && priceId is not null
                    && priceIdToPlan.TryGetValue(priceId, out var planName)
                    ? planName
                    : string.Empty));

            var paymentMethods = ordered.Count == 0
                ? string.Empty
                : string.Join(";", Enumerable.Repeat("Card", ordered.Count));

            var invoiceAmounts = string.Join(";",
                ordered.Select(p => FormatAmount(p.Amount, p.Currency)));

            sb.AppendLine(string.Join(",",
                CsvEscape(fullName),
                CsvEscape(email),
                CsvEscape(dob),
                CsvEscape(deletionDate),
                CsvEscape(paymentDates),
                CsvEscape(planTypes),
                CsvEscape(paymentMethods),
                CsvEscape(invoiceAmounts)));
        }

        var bytes = Encoding.UTF8.GetBytes(sb.ToString());
        var fileName = $"mindlex_users_{DateTime.UtcNow:yyyyMMdd_HHmmss}.csv";

        var adminId = AdminUserId ?? Guid.Empty;
        _logger.LogInformation(
            "Admin {AdminId} downloaded users CSV ({Bytes} bytes, {UserCount} rows).",
            adminId, bytes.Length, users.Count);

        return File(bytes, "text/csv; charset=utf-8", fileName);
    }

    private static string FormatAmount(long amountCents, string currency)
    {
        var symbol = currency?.ToUpperInvariant() switch
        {
            "USD" => "$",
            "EUR" => "€",
            "GBP" => "£",
            "JPY" => "¥",
            _ => (currency ?? string.Empty) + " "
        };

        var major = amountCents / 100m;
        var formatted = major == decimal.Truncate(major)
            ? ((long)major).ToString(CultureInfo.InvariantCulture)
            : major.ToString("0.00", CultureInfo.InvariantCulture);
        return $"{symbol}{formatted}";
    }

    private static string CsvEscape(string? value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        var needsQuoting = value.IndexOfAny(new[] { ',', '"', '\n', '\r' }) >= 0;
        if (!needsQuoting) return value;
        return "\"" + value.Replace("\"", "\"\"") + "\"";
    }

    [HttpPost("users/{userId:guid}/reset-password")]
    public async Task<IActionResult> ResetUserPassword(Guid userId, CancellationToken ct)
    {
        var adminId = AdminUserId;
        if (adminId is null) return Unauthorized();

        if (adminId.Value == userId)
        {
            return BadRequest(new
            {
                error = "Administrators cannot reset their own password from this screen. Use the standard password change flow.",
                code = "cannot_reset_self"
            });
        }

        var target = await _users.GetUserByIdAsync(userId, ct);
        if (target is null) return NotFound(new { error = "User not found." });

        var targetRoles = await _roles.GetUserRolesAsync(userId, ct);
        if (targetRoles.Any(r => string.Equals(r.Name, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase)))
            return Forbid();

        await _auth.ForgotPasswordAsync(target.Email, ct);

        var metadata = JsonSerializer.Serialize(new
        {
            triggeredByAdminId = adminId.Value,
            triggeredAt = DateTime.UtcNow,
            method = "reset_link"
        });

        await _activity.LogActivityAsync(
            userId,
            ActivityType.PasswordReset,
            $"Password reset initiated by administrator {adminId.Value}.",
            ClientIp ?? string.Empty,
            UserAgent ?? string.Empty,
            metadata,
            ct);

        _logger.LogInformation(
            "Admin {AdminId} triggered password reset for user {TargetUserId}.",
            adminId.Value, userId);

        return Ok(new
        {
            message = "Temporary password has been sent to the user’s email address.",
            targetUserId = userId
        });
    }

    [HttpPut("users/{userId:guid}/role")]
    public async Task<IActionResult> ChangeUserRole(
        Guid userId,
        [FromBody] ChangeUserRoleRequest req,
        CancellationToken ct)
    {
        var adminId = AdminUserId;
        if (adminId is null) return Unauthorized();

        if (adminId.Value == userId)
        {
            return BadRequest(new
            {
                error = "Administrators cannot change their own role.",
                code = "cannot_modify_self"
            });
        }

        var target = await _users.GetUserByIdAsync(userId, ct);
        if (target is null) return NotFound(new { error = "User not found." });

        var allRoles = await _roles.GetAllRolesAsync(ct);
        var newRoleEntity = allRoles.FirstOrDefault(r =>
            string.Equals(r.Name, req.Role, StringComparison.OrdinalIgnoreCase));
        if (newRoleEntity is null)
        {
            return BadRequest(new
            {
                error = $"Role '{req.Role}' does not exist. Make sure the RoleSeeder has run.",
                code = "role_not_found"
            });
        }

        var currentRoles = (await _roles.GetUserRolesAsync(userId, ct)).ToList();
        var oldRoleNames = currentRoles.Select(r => r.Name).ToList();

        var demotingAnAdmin = currentRoles.Any(r =>
            string.Equals(r.Name, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase));
        var movingToNonAdmin = !string.Equals(req.Role, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase);

        if (demotingAnAdmin && movingToNonAdmin)
        {
            if (await IsLastActiveAdminAsync(userId, ct))
            {
                return BadRequest(new
                {
                    error = "Cannot remove the last active administrator. Assign another admin first.",
                    code = "last_active_admin"
                });
            }
        }

        foreach (var existing in currentRoles)
        {
            await _roles.RemoveRoleFromUserAsync(userId, existing.Id, ct);
        }
        await _roles.AssignRoleToUserAsync(userId, newRoleEntity.Id, ct);

        var auditMetadata = JsonSerializer.Serialize(new
        {
            changedByAdminId = adminId.Value,
            oldRoles = oldRoleNames,
            newRole = newRoleEntity.Name,
            reason = req.Reason,
            timestamp = DateTime.UtcNow
        });

        await _activity.LogActivityAsync(
            userId,
            ActivityType.ProfileUpdate,
            $"Role changed from [{string.Join(", ", oldRoleNames)}] to [{newRoleEntity.Name}] by administrator {adminId.Value}.",
            ClientIp ?? string.Empty,
            UserAgent ?? string.Empty,
            auditMetadata,
            ct);

        await SendRoleChangeEmailAsync(target.Email, userId, newRoleEntity.Name, req.Reason, ct);

        _logger.LogInformation(
            "Admin {AdminId} changed user {TargetUserId} role to {NewRole}. Reason: {Reason}",
            adminId.Value, userId, newRoleEntity.Name, req.Reason);

        return Ok(new
        {
            message = "User role updated successfully.",
            userId,
            oldRoles = oldRoleNames,
            newRole = newRoleEntity.Name
        });
    }

    [HttpPost("users/{userId:guid}/deactivate")]
    public async Task<IActionResult> DeactivateUser(Guid userId, CancellationToken ct)
    {
        var adminId = AdminUserId;
        if (adminId is null) return Unauthorized();
        if (adminId.Value == userId)
            return BadRequest(new { error = "Administrators cannot deactivate their own account.", code = "cannot_modify_self" });

        var target = await _users.GetUserByIdAsync(userId, ct);
        if (target is null) return NotFound(new { error = "User not found." });

        if (await IsTargetTheLastActiveAdminAsync(userId, ct))
            return BadRequest(new { error = "Cannot deactivate the last active administrator.", code = "last_active_admin" });

        await _users.UpdateUserAsync(userId, new UpdateUserDto { Status = UserStatus.Deactivated }, ct);
        await _sessions.RevokeAllSessionsAsync(userId, ct);

        await LogAdminActionAsync(userId, adminId.Value, ActivityType.AccountDeactivated,
            description: $"Account deactivated by administrator {adminId.Value}.",
            extraMeta: new { action = "deactivate" }, ct);

        _logger.LogInformation("Admin {AdminId} deactivated user {TargetUserId}.", adminId.Value, userId);
        return Ok(new { message = "User account deactivated.", userId });
    }

    [HttpPost("users/{userId:guid}/activate")]
    public async Task<IActionResult> ActivateUser(Guid userId, CancellationToken ct)
    {
        var adminId = AdminUserId;
        if (adminId is null) return Unauthorized();

        var target = await _users.GetUserByIdAsync(userId, ct);
        if (target is null) return NotFound(new { error = "User not found." });

        await _users.UpdateUserAsync(userId, new UpdateUserDto { Status = UserStatus.Active }, ct);

        await LogAdminActionAsync(userId, adminId.Value, ActivityType.AccountUnlocked,
            description: $"Account reactivated by administrator {adminId.Value}.",
            extraMeta: new { action = "activate" }, ct);

        _logger.LogInformation("Admin {AdminId} activated user {TargetUserId}.", adminId.Value, userId);
        return Ok(new { message = "User account activated.", userId });
    }

    [HttpDelete("users/{userId:guid}")]
    public async Task<IActionResult> DeleteUser(Guid userId, CancellationToken ct)
    {
        var adminId = AdminUserId;
        if (adminId is null) return Unauthorized();
        if (adminId.Value == userId)
            return BadRequest(new { error = "Administrators cannot delete their own account.", code = "cannot_modify_self" });

        var target = await _users.GetUserByIdAsync(userId, ct);
        if (target is null) return NotFound(new { error = "User not found." });

        if (await IsTargetTheLastActiveAdminAsync(userId, ct))
            return BadRequest(new { error = "Cannot delete the last active administrator.", code = "last_active_admin" });

        var hasSuccessfulPayments = await _stripeDb.DainnStripePayments
            .AnyAsync(p =>
                p.OwnerId == userId.ToString() &&
                p.Status == DainnStripePaymentStatus.Succeeded,
                ct);

        if (!hasSuccessfulPayments)
        {
            await _users.DeleteUserAsync(userId, ct);

            await LogAdminActionAsync(userId, adminId.Value, ActivityType.AccountDeactivated,
                description: $"Account permanently deleted by administrator {adminId.Value} (no successful payments).",
                extraMeta: new { action = "delete_permanent" }, ct);

            _logger.LogInformation("Admin {AdminId} permanently deleted user {TargetUserId}.", adminId.Value, userId);
            return Ok(new
            {
                message = "User account deleted.",
                userId,
                mode = "permanent"
            });
        }

        await _retention.ApplyPartialDeleteAsync(userId, source: $"admin:{adminId.Value}", ct);

        _logger.LogInformation(
            "Admin {AdminId} partially deleted user {TargetUserId} via SR2 retention service.",
            adminId.Value, userId);

        return Ok(new
        {
            message = "User account deleted.",
            userId,
            mode = "partial",
            note = $"User has prior successful payments. Minimal data (name, email, invoices) retained {Sr2DataRetentionService.RetentionYears} years per SR2; all other data deleted."
        });
    }

    [HttpGet("subscriptions")]
    public async Task<IActionResult> ListSubscriptions(CancellationToken ct)
    {
        var users = await _userDb.Users
            .Include(u => u.Profile)
            .Where(u => !u.Email.EndsWith(Sr2DataRetentionService.TombstoneEmailSuffix))
            .AsNoTracking()
            .ToListAsync(ct);
        var userIdStrings = users.Select(u => u.Id.ToString()).ToHashSet();

        var subs = await _stripeDb.DainnStripeSubscriptions
            .Where(s => userIdStrings.Contains(s.OwnerId))
            .AsNoTracking()
            .ToListAsync(ct);
        var latestSubByOwner = subs
            .GroupBy(s => s.OwnerId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(s => s.CreatedAt).First());

        var allRoles = await _roles.GetAllRolesAsync(ct);
        var userRoles = new Dictionary<Guid, List<string>>();
        foreach (var u in users)
        {
            var roles = await _roles.GetUserRolesAsync(u.Id, ct);
            userRoles[u.Id] = roles.Select(r => r.Name).ToList();
        }

        var rows = users.Select(u =>
        {
            var roleNames = userRoles[u.Id];
            var currentTier = ResolveTier(roleNames);
            latestSubByOwner.TryGetValue(u.Id.ToString(), out var sub);
            var status = DeriveStatus(currentTier, sub);

            return new
            {
                userId = u.Id,
                fullName = u.Profile?.DisplayName,
                email = u.Email,
                dateOfBirth = u.Profile?.DateOfBirth,
                currentRole = $"{currentTier} User",
                userStatus = u.Status.ToString(),
                subscriptionStatus = status
            };
        });

        return Ok(rows);
    }

    [HttpGet("analytics")]
    public async Task<IActionResult> GetAnalytics(CancellationToken ct)
    {
        // ---------- Users + roles ----------
        var users = await _userDb.Users
            .Include(u => u.Profile)
            .Where(u => !u.Email.EndsWith(Sr2DataRetentionService.TombstoneEmailSuffix))
            .AsNoTracking()
            .ToListAsync(ct);

        var roleByUser = new Dictionary<Guid, string>();
        foreach (var u in users)
        {
            var roles = (await _roles.GetUserRolesAsync(u.Id, ct)).Select(r => r.Name).ToList();
            roleByUser[u.Id] = ResolveTier(roles);
        }

        var totalUsers = users.Count;
        var freeUsers = roleByUser.Values.Count(t => string.Equals(t, RoleSeeder.FreeRoleName, StringComparison.OrdinalIgnoreCase));
        var plusUsers = roleByUser.Values.Count(t => string.Equals(t, RoleSeeder.PlusRoleName, StringComparison.OrdinalIgnoreCase));
        var premiumUsers = roleByUser.Values.Count(t => string.Equals(t, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase));
        var activeSubscribers = plusUsers + premiumUsers;
        var conversionRate = totalUsers == 0 ? 0d : Math.Round(activeSubscribers * 100d / totalUsers, 1);

        var activeStatus = users.Count(u => u.Status == UserStatus.Active);
        var deactivatedStatus = users.Count(u => u.Status == UserStatus.Deactivated);
        var lockedStatus = users.Count(u => u.Status == UserStatus.Locked);
        var pendingStatus = users.Count(u => u.Status == UserStatus.Pending);
        var suspendedStatus = users.Count(u => u.Status == UserStatus.Suspended);

        // ---------- Signups last 30 days ----------
        var now = DateTime.UtcNow;
        var since30 = now.Date.AddDays(-29);
        var signupBuckets = new int[30];
        foreach (var u in users)
        {
            if (u.CreatedAt.Date < since30) continue;
            var idx = (int)(u.CreatedAt.Date - since30).TotalDays;
            if (idx >= 0 && idx < 30) signupBuckets[idx]++;
        }
        var signupSeries = Enumerable.Range(0, 30).Select(i => new
        {
            date = since30.AddDays(i).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            count = signupBuckets[i]
        }).ToList();
        var newUsers30d = signupBuckets.Sum();

        // ---------- Revenue (last 12 months from successful payments) ----------
        var userIdStrings = users.Select(u => u.Id.ToString()).ToHashSet();
        var since12mo = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(-11);
        var payments = await _stripeDb.DainnStripePayments
            .Where(p => userIdStrings.Contains(p.OwnerId)
                     && p.Status == DainnStripePaymentStatus.Succeeded
                     && p.CreatedAt >= since12mo)
            .AsNoTracking()
            .ToListAsync(ct);

        var revenueSeries = new List<object>();
        long totalRevenueCents = 0;
        long currentMonthRevenue = 0;
        var thisMonthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        for (int i = 0; i < 12; i++)
        {
            var start = since12mo.AddMonths(i);
            var end = start.AddMonths(1);
            var monthSum = payments.Where(p => p.CreatedAt >= start && p.CreatedAt < end).Sum(p => p.Amount);
            totalRevenueCents += monthSum;
            if (start == thisMonthStart) currentMonthRevenue = monthSum;
            revenueSeries.Add(new
            {
                month = start.ToString("yyyy-MM", CultureInfo.InvariantCulture),
                label = start.ToString("MMM", CultureInfo.InvariantCulture),
                amount = monthSum / 100m
            });
        }

        // ---------- MRR estimate (sum of monthly-equivalent of active subs) ----------
        var subs = await _stripeDb.DainnStripeSubscriptions
            .Where(s => userIdStrings.Contains(s.OwnerId) && s.Status == DainnStripeSubscriptionStatus.Active)
            .AsNoTracking()
            .ToListAsync(ct);

        var plans = _config.GetSection("Mindlex:Plans").Get<List<PlanOptions>>() ?? new();
        decimal mrrEur = 0m;
        foreach (var s in subs)
        {
            if (string.IsNullOrWhiteSpace(s.StripePriceId)) continue;
            foreach (var plan in plans)
            {
                foreach (var pricing in plan.Pricing.Values)
                {
                    if (string.Equals(pricing.StripeMonthlyPriceId, s.StripePriceId, StringComparison.OrdinalIgnoreCase))
                    {
                        mrrEur += pricing.MonthlyPriceCents / 100m;
                    }
                    else if (string.Equals(pricing.StripeAnnualPriceId, s.StripePriceId, StringComparison.OrdinalIgnoreCase))
                    {
                        mrrEur += (pricing.AnnualPriceCents / 12m) / 100m;
                    }
                }
            }
        }

        // ---------- Engagement (chat / drive / news) ----------
        var chatThreads = await _mindlexDb.ChatThreads.CountAsync(ct);
        var since7 = now.AddDays(-7);
        var chatMessages7d = await _mindlexDb.ChatMessages.CountAsync(m => m.CreatedAt >= since7, ct);
        var savedDocs = await _mindlexDb.SavedDocuments.CountAsync(ct);
        var newsArticlesTotal = await _mindlexDb.NewsArticles.CountAsync(ct);
        var newsArticles30d = await _mindlexDb.NewsArticles.CountAsync(a => a.IngestedAt >= since30, ct);

        // Top news topics
        var allTopics = await _mindlexDb.NewsArticles
            .Select(a => a.TopicsCsv)
            .ToListAsync(ct);
        var topicCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var csv in allTopics)
        {
            if (string.IsNullOrWhiteSpace(csv)) continue;
            foreach (var t in csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                topicCounts[t] = topicCounts.TryGetValue(t, out var c) ? c + 1 : 1;
            }
        }
        var topTopics = topicCounts
            .OrderByDescending(kv => kv.Value)
            .Take(6)
            .Select(kv => new { topic = kv.Key, count = kv.Value })
            .ToList();

        // ---------- Recent payments (latest 5) ----------
        var recentPayments = payments
            .OrderByDescending(p => p.CreatedAt)
            .Take(5)
            .Select(p =>
            {
                Guid.TryParse(p.OwnerId, out var ownerGuid);
                var user = users.FirstOrDefault(u => u.Id == ownerGuid);
                return new
                {
                    id = p.Id,
                    paidAt = p.CreatedAt,
                    paidAtDisplay = p.CreatedAt.ToString("dd MMM yyyy", CultureInfo.InvariantCulture),
                    fullName = user?.Profile?.DisplayName ?? user?.Email ?? "—",
                    email = user?.Email,
                    amount = p.Amount / 100m,
                    amountDisplay = FormatAmount(p.Amount, p.Currency),
                    currency = p.Currency
                };
            })
            .ToList();

        return Ok(new
        {
            generatedAt = now,
            totals = new
            {
                users = totalUsers,
                activeSubscribers,
                conversionRate,
                mrr = Math.Round(mrrEur, 2),
                mrrCurrency = "EUR",
                currentMonthRevenue = currentMonthRevenue / 100m,
                totalRevenue12mo = totalRevenueCents / 100m,
                newUsers30d,
                chatThreads,
                chatMessages7d,
                savedDocs,
                newsArticlesTotal,
                newsArticles30d
            },
            tierBreakdown = new
            {
                free = freeUsers,
                plus = plusUsers,
                premium = premiumUsers
            },
            statusBreakdown = new
            {
                active = activeStatus,
                pending = pendingStatus,
                suspended = suspendedStatus,
                locked = lockedStatus,
                deactivated = deactivatedStatus
            },
            signupSeries,
            revenueSeries,
            topTopics,
            recentPayments
        });
    }

    [HttpGet("users/{userId:guid}/subscription")]
    public async Task<IActionResult> GetUserSubscriptionDetails(Guid userId, CancellationToken ct)
    {
        var user = await _userDb.Users.Include(u => u.Profile).FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null) return NotFound(new { error = "User not found." });

        var roleNames = (await _roles.GetUserRolesAsync(userId, ct)).Select(r => r.Name).ToList();
        var currentTier = ResolveTier(roleNames);
        var ownerId = userId.ToString();

        var sub = await _stripeDb.DainnStripeSubscriptions
            .Where(s => s.OwnerId == ownerId)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(ct);

        var lastPaid = await _stripeDb.DainnStripePayments
            .Where(p => p.OwnerId == ownerId && p.Status == DainnStripePaymentStatus.Succeeded)
            .OrderByDescending(p => p.CreatedAt)
            .FirstOrDefaultAsync(ct);

        var status = DeriveStatus(currentTier, sub);
        var isPaid = !string.Equals(currentTier, RoleSeeder.FreeRoleName, StringComparison.OrdinalIgnoreCase);

        DateTime? startDate = sub?.CreatedAt;
        DateTime? endDate = null;
        DateTime? nextPaymentDue = null;
        string? paymentStatus = null;

        if (status == "Active")
        {
            endDate = sub?.CurrentPeriodEnd;
            nextPaymentDue = sub?.CurrentPeriodEnd;
            paymentStatus = lastPaid is null ? null : "Paid";
        }
        else if (status == "Canceled")
        {
            endDate = sub?.CanceledAt ?? sub?.UpdatedAt;
            paymentStatus = lastPaid is null ? null : "Paid";
        }
        else if (status == "Expired")
        {
            endDate = sub?.CurrentPeriodEnd ?? sub?.UpdatedAt;
            paymentStatus = "Not Paid";
        }

        var payments = await _stripeDb.DainnStripePayments
            .Where(p => p.OwnerId == ownerId)
            .OrderByDescending(p => p.CreatedAt)
            .AsNoTracking()
            .ToListAsync(ct);

        var paymentSubs = await _stripeDb.DainnStripeSubscriptions
            .Where(s => s.OwnerId == ownerId)
            .OrderBy(s => s.CreatedAt)
            .AsNoTracking()
            .ToListAsync(ct);

        var history = payments.Select(p =>
        {
            var subForPayment = paymentSubs
                .Where(s => s.CreatedAt <= p.CreatedAt.AddDays(7))
                .OrderByDescending(s => s.CreatedAt)
                .FirstOrDefault() ?? paymentSubs.LastOrDefault();

            var planLabel = subForPayment is null ? null : BuildPlanLabel(subForPayment.StripePriceId);
            var mindlexStatus = MapPaymentStatus(p.Status);

            return new
            {
                id = p.Id,
                paidAt = p.CreatedAt,
                paidAtDisplay = p.CreatedAt.ToString("dd MMM yyyy, HH:mm:ss", CultureInfo.InvariantCulture),
                subscriptionPlan = planLabel,
                amount = p.Amount / 100m,
                amountDisplay = FormatAmount(p.Amount, p.Currency),
                currency = p.Currency,
                status = mindlexStatus,
                invoiceDownloadUrl = mindlexStatus == "Paid"
                    ? $"/api/billing/payments/{p.Id}/invoice-pdf"
                    : null
            };
        }).ToList();

        return Ok(new
        {
            userId,
            fullName = user.Profile?.DisplayName,
            email = user.Email,
            dateOfBirth = user.Profile?.DateOfBirth,
            currentRole = currentTier,
            subscriptionStatus = status,
            startDate = isPaid ? startDate : null,
            endDate = isPaid ? endDate : null,
            lastPaymentDate = isPaid ? lastPaid?.CreatedAt : null,
            nextPaymentDue = isPaid ? nextPaymentDue : null,
            paymentStatus = isPaid ? paymentStatus : null,
            canCancel = status == "Active" && isPaid && sub != null && !sub.CancelAtPeriodEnd,
            paymentHistory = history
        });
    }

    [HttpPost("users/{userId:guid}/cancel-subscription")]
    public async Task<IActionResult> CancelUserSubscription(Guid userId, CancellationToken ct)
    {
        var adminId = AdminUserId;
        if (adminId is null) return Unauthorized();
        if (adminId.Value == userId)
            return BadRequest(new { error = "Use the standard cancel flow for your own subscription.", code = "cannot_modify_self" });

        var ownerId = userId.ToString();
        var sub = await _stripeDb.DainnStripeSubscriptions
            .Where(s => s.OwnerId == ownerId)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (sub is null)
            return BadRequest(new { error = "User has no active subscription to cancel.", code = "no_subscription" });
        if (sub.CancelAtPeriodEnd)
            return BadRequest(new { error = "Subscription is already canceled.", code = "already_canceled" });
        if (sub.Status is DainnStripeSubscriptionStatus.Canceled
                       or DainnStripeSubscriptionStatus.Unpaid
                       or DainnStripeSubscriptionStatus.PastDue)
            return BadRequest(new { error = "Subscription is not active.", code = "subscription_inactive" });

        try
        {
            var stripeSubService = new SubscriptionService();
            await stripeSubService.UpdateAsync(sub.StripeSubscriptionId, new SubscriptionUpdateOptions
            {
                CancelAtPeriodEnd = true
            }, cancellationToken: ct);
        }
        catch (StripeException ex)
        {
            _logger.LogError(ex, "Stripe cancel failed for user {UserId}", userId);
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "Failed to cancel subscription with Stripe.",
                code = "stripe_error"
            });
        }

        var tier = ResolveTier((await _roles.GetUserRolesAsync(userId, ct)).Select(r => r.Name).ToList());
        await SendAdminCancellationEmailAsync(userId, tier, sub.CurrentPeriodEnd, ct);

        await LogAdminActionAsync(userId, adminId.Value, ActivityType.ProfileUpdate,
            description: $"Subscription canceled by administrator {adminId.Value}.",
            extraMeta: new { action = "admin_cancel_subscription", tier, endDate = sub.CurrentPeriodEnd }, ct);

        return Ok(new
        {
            message = "User's subscription has been canceled.",
            userId,
            endDate = sub.CurrentPeriodEnd
        });
    }

    private async Task SendAdminCancellationEmailAsync(Guid userId, string tier, DateTime? endDate, CancellationToken ct)
    {
        var profile = await _profiles.GetProfileAsync(userId, ct);
        if (profile is null || string.IsNullOrWhiteSpace(profile.Email)) return;

        var fullName = string.IsNullOrWhiteSpace(profile.DisplayName) ? "there" : profile.DisplayName;
        var safeName = WebUtility.HtmlEncode(fullName);
        var safeTier = WebUtility.HtmlEncode(tier);
        var safeEndDate = endDate.HasValue ? endDate.Value.ToString("yyyy-MM-dd") : "the end of your current billing cycle";

        var htmlBody = $"""
            <p>Hello {safeName},</p>
            <p>We've received a request to cancel your Mindlex {safeTier} subscription.</p>
            <p>Your access to {safeTier} features will remain active until the end of your current billing cycle on {safeEndDate}.</p>
            <p>If this was a mistake or you wish to reactivate at any time, you can resubscribe via your account settings.</p>
            <p>Thank you for using Mindlex.</p>
            <p>— The Mindlex Team</p>
            """;

        try
        {
            await _email.SendEmailAsync(
                profile.Email,
                fullName,
                $"Your Mindlex {tier} subscription has been cancelled",
                htmlBody,
                Array.Empty<EmailAttachment>(),
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send admin-cancellation email to {Email}", profile.Email);
        }
    }

    private static string ResolveTier(IList<string> roleNames)
    {
        if (roleNames.Any(r => string.Equals(r, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase)))
            return RoleSeeder.PremiumRoleName;
        if (roleNames.Any(r => string.Equals(r, RoleSeeder.PlusRoleName, StringComparison.OrdinalIgnoreCase)))
            return RoleSeeder.PlusRoleName;
        return RoleSeeder.FreeRoleName;
    }

    private static string DeriveStatus(string currentTier, DainnStripe.Entities.DainnStripeSubscription? sub)
    {
        if (string.Equals(currentTier, RoleSeeder.FreeRoleName, StringComparison.OrdinalIgnoreCase))
        {
            if (sub is not null && (sub.Status is DainnStripeSubscriptionStatus.Canceled
                                                 or DainnStripeSubscriptionStatus.Unpaid
                                                 or DainnStripeSubscriptionStatus.PastDue))
                return "Expired";
            return "Active";
        }

        if (sub is null) return "Active";
        if (sub.CancelAtPeriodEnd && sub.Status is DainnStripeSubscriptionStatus.Active or DainnStripeSubscriptionStatus.Trialing)
            return "Canceled";
        if (sub.Status is DainnStripeSubscriptionStatus.Canceled
                       or DainnStripeSubscriptionStatus.Unpaid
                       or DainnStripeSubscriptionStatus.PastDue)
            return "Expired";
        return "Active";
    }

    private string? BuildPlanLabel(string? priceId)
    {
        if (string.IsNullOrWhiteSpace(priceId)) return null;
        var plans = _config.GetSection("Mindlex:Plans").Get<List<PlanOptions>>() ?? new();
        foreach (var plan in plans)
        {
            foreach (var pricing in plan.Pricing.Values)
            {
                if (string.Equals(pricing.StripeMonthlyPriceId, priceId, StringComparison.OrdinalIgnoreCase))
                    return $"{plan.Tier} Monthly";
                if (string.Equals(pricing.StripeAnnualPriceId, priceId, StringComparison.OrdinalIgnoreCase))
                    return $"{plan.Tier} Annual";
            }
        }
        return null;
    }

    private static string MapPaymentStatus(DainnStripePaymentStatus status) => status switch
    {
        DainnStripePaymentStatus.Succeeded => "Paid",
        DainnStripePaymentStatus.Pending => "Pending",
        _ => "Not Paid"
    };

    private async Task LogAdminActionAsync(
        Guid targetUserId,
        Guid adminId,
        ActivityType activityType,
        string description,
        object extraMeta,
        CancellationToken ct)
    {
        var metadata = JsonSerializer.Serialize(new
        {
            triggeredByAdminId = adminId,
            timestamp = DateTime.UtcNow,
            extra = extraMeta
        });

        await _activity.LogActivityAsync(
            targetUserId,
            activityType,
            description,
            ClientIp ?? string.Empty,
            UserAgent ?? string.Empty,
            metadata,
            ct);
    }

    private async Task<bool> IsTargetTheLastActiveAdminAsync(Guid candidateUserId, CancellationToken ct)
    {
        var target = await _users.GetUserByIdAsync(candidateUserId, ct);
        if (target is null) return false;

        var isAdmin = target.Roles.Any(r => string.Equals(r, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase));
        if (!isAdmin) return false;

        return await IsLastActiveAdminAsync(candidateUserId, ct);
    }

    private async Task<bool> IsLastActiveAdminAsync(Guid candidateUserId, CancellationToken ct)
    {
        var (users, _) = await _users.GetUsersAsync(1, int.MaxValue, string.Empty, UserStatus.Active, ct);

        var otherActiveAdmins = users.Count(u =>
            u.Id != candidateUserId &&
            u.Roles.Any(r => string.Equals(r, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase)));

        return otherActiveAdmins == 0;
    }

    private async Task SendRoleChangeEmailAsync(
        string toEmail,
        Guid userId,
        string newRole,
        string adminReason,
        CancellationToken ct)
    {
        var profile = await _profiles.GetProfileAsync(userId, ct);
        var displayName = string.IsNullOrWhiteSpace(profile?.DisplayName) ? "there" : profile.DisplayName;

        var safeReason = System.Net.WebUtility.HtmlEncode(adminReason);
        var safeName = System.Net.WebUtility.HtmlEncode(displayName);
        var safeRole = System.Net.WebUtility.HtmlEncode(newRole);

        var htmlBody = $"""
            <p>Hi {safeName},</p>
            <p>We would like to inform you that your account role on Mindlex has been updated.</p>
            <p><strong>New Role:</strong> {safeRole}<br/>
               <strong>Changed By:</strong> Admin</p>
            <p><strong>Reason Provided:</strong><br/>{safeReason}</p>
            <p>This change takes effect immediately and may impact your access to certain features.</p>
            <p>If you have any questions or concerns, feel free to contact our support team.</p>
            <p>Best regards,<br/>The Mindlex Team</p>
            """;

        try
        {
            await _email.SendEmailAsync(
                toEmail,
                displayName,
                "Your Account Role Has Been Updated",
                htmlBody,
                Array.Empty<EmailAttachment>(),
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send role-change email to {Email}", toEmail);
        }
    }
}
