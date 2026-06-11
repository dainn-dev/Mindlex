using System.Globalization;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using DainnStripe.Data;
using DainnStripe.Enums;
using DainnUser.Core.Enums;
using DainnUser.Core.Exceptions;
using DainnUser.Core.Interfaces.Services;
using DainnUser.Core.Models.Profile;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyLaw.Models;
using MyLaw.Services;

namespace MyLaw.Controllers;

[ApiController]
[Authorize]
[Route("api/profile")]
public class ProfileController : ControllerBase
{
    private readonly IProfileService _profiles;
    private readonly IAuthenticationService _auth;
    private readonly IRoleService _roles;
    private readonly ILoginHistoryService _loginHistory;
    private readonly IActivityService _activity;
    private readonly DainnStripeDbContext _stripeDb;

    public ProfileController(
        IProfileService profiles,
        IAuthenticationService auth,
        IRoleService roles,
        ILoginHistoryService loginHistory,
        IActivityService activity,
        DainnStripeDbContext stripeDb)
    {
        _profiles = profiles;
        _auth = auth;
        _roles = roles;
        _loginHistory = loginHistory;
        _activity = activity;
        _stripeDb = stripeDb;
    }

    private Guid? CurrentUserId
    {
        get
        {
            var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
            return Guid.TryParse(sub, out var id) ? id : null;
        }
    }

    private Guid? CurrentSessionId
    {
        get
        {
            var sid = User.FindFirstValue("sid");
            return Guid.TryParse(sid, out var id) ? id : null;
        }
    }

    private string? ClientIp => HttpContext.Connection.RemoteIpAddress?.ToString();
    private string? UserAgent => Request.Headers.UserAgent.ToString();

    [HttpGet]
    [HttpGet("me")]
    public async Task<IActionResult> GetMyProfile(CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var profile = await _profiles.GetProfileAsync(userId.Value, ct);
        var roleNames = (await _roles.GetUserRolesAsync(userId.Value, ct)).Select(r => r.Name).ToList();

        // Check onboarding status
        var onboardingCompleted = profile.DateOfBirth is not null;

        // Resolve tone preference
        var tone = ChatController.TonePlain;
        if (roleNames.Any(r => string.Equals(r, RoleSeeder.PlusRoleName, StringComparison.OrdinalIgnoreCase)
                              || string.Equals(r, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase)
                              || string.Equals(r, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase)))
        {
            tone = ChatController.ToneTechnical;
        }

        return Ok(new
        {
            id = userId.Value,
            email = profile.Email,
            fullName = profile.DisplayName ?? profile.Email,
            dateOfBirth = profile.DateOfBirth,
            roles = roleNames,
            tone,
            onboardingCompleted
        });
    }

    [HttpPut("name")]
    public async Task<IActionResult> UpdateFullName([FromBody] UpdateFullNameRequest req, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        await _profiles.UpdateProfileAsync(userId.Value, new UpdateProfileDto
        {
            DisplayName = req.FullName
        }, ct);

        return Ok(new { message = "Your profile has been updated successfully." });
    }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req, CancellationToken ct)
    {
        var userId = CurrentUserId;
        var sessionId = CurrentSessionId;
        if (userId is null || sessionId is null) return Unauthorized();

        try
        {
            await _auth.ChangePasswordAsync(
                userId.Value,
                sessionId.Value,
                req.CurrentPassword,
                req.NewPassword,
                ct);
        }
        catch (InvalidCurrentPasswordException)
        {
            return BadRequest(new { error = "Current password is incorrect.", code = "invalid_current_password" });
        }

        await _auth.LogoutAsync(sessionId.Value, ct);

        return Ok(new
        {
            message = "Your password has been changed.",
            loggedOut = true
        });
    }

    private const string OnboardingMarker = "onboarding_completed";

    [HttpGet("onboarding/status")]
    public async Task<IActionResult> GetOnboardingStatus(CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var (activities, _) = await _activity.GetActivityLogAsync(
            userId.Value, pageNumber: 1, pageSize: 100,
            activityType: ActivityType.ProfileUpdate,
            startDate: null, endDate: null, ct);

        var completedEntry = activities.FirstOrDefault(a =>
            (a.Metadata?.Contains(OnboardingMarker, StringComparison.OrdinalIgnoreCase) ?? false));

        return Ok(new
        {
            completed = completedEntry is not null,
            completedAt = completedEntry?.CreatedAt
        });
    }

    [HttpPost("onboarding/complete")]
    public async Task<IActionResult> CompleteOnboarding(CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var (existing, _) = await _activity.GetActivityLogAsync(
            userId.Value, pageNumber: 1, pageSize: 100,
            activityType: ActivityType.ProfileUpdate,
            startDate: null, endDate: null, ct);

        var alreadyDone = existing.FirstOrDefault(a =>
            (a.Metadata?.Contains(OnboardingMarker, StringComparison.OrdinalIgnoreCase) ?? false));

        if (alreadyDone is not null)
        {
            return Ok(new
            {
                completed = true,
                completedAt = alreadyDone.CreatedAt,
                alreadyMarked = true
            });
        }

        var now = DateTime.UtcNow;
        var metadata = JsonSerializer.Serialize(new { action = OnboardingMarker, timestamp = now });

        await _activity.LogActivityAsync(
            userId.Value,
            ActivityType.ProfileUpdate,
            "Onboarding guide viewed.",
            ClientIp ?? string.Empty,
            UserAgent ?? string.Empty,
            metadata,
            ct);

        return Ok(new
        {
            completed = true,
            completedAt = now,
            alreadyMarked = false
        });
    }

    [HttpGet("download")]
    public async Task<IActionResult> DownloadMyData(CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var profile = await _profiles.GetProfileAsync(userId.Value, ct);
        var roleList = await _roles.GetUserRolesAsync(userId.Value, ct);
        var subscription = await _stripeDb.DainnStripeSubscriptions
            .Where(s => s.OwnerId == userId.Value.ToString())
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(ct);

        var (recentLogins, _) = await _loginHistory.GetLoginHistoryAsync(
            userId.Value, pageNumber: 1, pageSize: 100, startDate: null, endDate: null, ct);

        var ipAddresses = recentLogins
            .Where(h => h.IsSuccessful && !string.IsNullOrWhiteSpace(h.IpAddress))
            .Select(h => h.IpAddress)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var roleDisplay = FormatRoleDisplay(roleList.Select(r => r.Name));
        var subscriptionDisplay = FormatSubscriptionStatus(subscription?.Status);

        var sb = new StringBuilder();
        sb.AppendLine($"Full Name: {profile.DisplayName ?? "(not set)"}");
        sb.AppendLine($"Email: {profile.Email}");
        sb.AppendLine($"Date of Birth: {(profile.DateOfBirth?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "(not set)")}");
        sb.AppendLine($"Role: {roleDisplay}");
        sb.AppendLine($"Subscription Status: {subscriptionDisplay}");
        sb.AppendLine("IP Addresses:");
        if (ipAddresses.Count == 0)
        {
            sb.AppendLine("  (none recorded)");
        }
        else
        {
            foreach (var ip in ipAddresses)
                sb.AppendLine($"  - {ip}");
        }

        var bytes = Encoding.UTF8.GetBytes(sb.ToString());

        var metadata = JsonSerializer.Serialize(new
        {
            action = "download_personal_data",
            timestamp = DateTime.UtcNow,
            sizeBytes = bytes.Length
        });

        try
        {
            await _activity.LogActivityAsync(
                userId.Value,
                ActivityType.ProfileUpdate,
                "User downloaded personal data export.",
                ClientIp ?? string.Empty,
                UserAgent ?? string.Empty,
                metadata,
                ct);
        }
        catch
        {
            // audit logging should not break the download
        }

        return File(bytes, "text/plain; charset=utf-8", "account_info.txt");
    }

    private static string FormatRoleDisplay(IEnumerable<string> roleNames)
    {
        var rolesArr = roleNames.ToArray();
        if (rolesArr.Length == 0) return "(none)";

        var topRole = rolesArr.FirstOrDefault(r =>
            string.Equals(r, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase)) ?? rolesArr[0];

        return string.Equals(topRole, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase)
            ? "Admin"
            : $"{topRole} User";
    }

    private static string FormatSubscriptionStatus(DainnStripeSubscriptionStatus? status)
    {
        return status switch
        {
            DainnStripeSubscriptionStatus.Active or DainnStripeSubscriptionStatus.Trialing => "Active",
            DainnStripeSubscriptionStatus.Canceled => "Canceled",
            DainnStripeSubscriptionStatus.PastDue or DainnStripeSubscriptionStatus.Unpaid => "Expired",
            null => "None",
            _ => "Inactive"
        };
    }
}
