using System.Net;
using System.Security.Claims;
using DainnStripe.Data;
using DainnStripe.Enums;
using DainnStripe.Interfaces;
using DainnStripe.Models;
using DainnUser.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Mindlex.Models;
using Mindlex.Services;
using Stripe;
using EmailAttachment = DainnUser.Core.Interfaces.Services.EmailAttachment;

namespace Mindlex.Controllers;

[ApiController]
[Authorize]
[Route("api/subscriptions")]
public class SubscriptionController : ControllerBase
{
    private readonly IDainnStripeCheckoutService _checkout;
    private readonly IRoleService _roles;
    private readonly IProfileService _profiles;
    private readonly IEmailService _email;
    private readonly DainnStripeDbContext _stripeDb;
    private readonly IConfiguration _config;
    private readonly ILogger<SubscriptionController> _logger;

    public SubscriptionController(
        IDainnStripeCheckoutService checkout,
        IRoleService roles,
        IProfileService profiles,
        IEmailService email,
        DainnStripeDbContext stripeDb,
        IConfiguration config,
        ILogger<SubscriptionController> logger)
    {
        _checkout = checkout;
        _roles = roles;
        _profiles = profiles;
        _email = email;
        _stripeDb = stripeDb;
        _config = config;
        _logger = logger;
    }

    private Guid? CurrentUserId
    {
        get
        {
            var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
            return Guid.TryParse(sub, out var id) ? id : null;
        }
    }

    [HttpGet("me")]
    public async Task<IActionResult> GetMySubscription(
        [FromQuery] string? currency = null,
        CancellationToken ct = default)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var userRoles = await _roles.GetUserRolesAsync(userId.Value, ct);
        var roleNames = userRoles.Select(r => r.Name).ToList();
        var currentTier = ResolveTier(roleNames);

        var subscription = await _stripeDb.DainnStripeSubscriptions
            .Where(s => s.OwnerId == userId.Value.ToString())
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(ct);

        var resolvedCurrency = (currency ?? _config.GetValue<string>("Mindlex:DefaultCurrency") ?? "EUR")
            .ToUpperInvariant();

        var plans = _config.GetSection("Mindlex:Plans").Get<List<PlanOptions>>() ?? new();
        var currentPlan = plans.FirstOrDefault(p =>
            string.Equals(p.Tier, currentTier, StringComparison.OrdinalIgnoreCase));
        var planPricing = currentPlan?.Pricing.TryGetValue(resolvedCurrency, out var pt) == true ? pt : null;

        return Ok(new
        {
            currentTier,
            plan = currentPlan is null ? null : new
            {
                tier = currentPlan.Tier,
                displayName = currentPlan.DisplayName,
                currency = resolvedCurrency,
                monthlyPriceCents = planPricing?.MonthlyPriceCents ?? 0,
                annualPriceCents = planPricing?.AnnualPriceCents ?? 0
            },
            subscription = subscription is null ? null : new
            {
                id = subscription.Id,
                stripeSubscriptionId = subscription.StripeSubscriptionId,
                stripePriceId = subscription.StripePriceId,
                status = subscription.Status.ToString(),
                cancelAtPeriodEnd = subscription.CancelAtPeriodEnd,
                currentPeriodEnd = subscription.CurrentPeriodEnd,
                canceledAt = subscription.CanceledAt
            }
        });
    }

    [HttpPost("checkout")]
    public async Task<IActionResult> StartCheckout([FromBody] StartSubscriptionRequest req, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var request = new CreateCheckoutSessionRequest
        {
            OwnerId = userId.Value.ToString(),
            Mode = DainnStripeCheckoutMode.Subscription,
            SuccessUrl = req.SuccessUrl,
            CancelUrl = req.CancelUrl,
            LineItems =
            {
                new CreateCheckoutSessionLineItem
                {
                    StripePriceId = req.PriceId,
                    Quantity = 1
                }
            }
        };

        var result = await _checkout.CreateAsync(request, ct);
        return Ok(new { sessionId = result.SessionId, url = result.Url });
    }

    [HttpPost("cancel")]
    public async Task<IActionResult> Cancel([FromBody] CancelSubscriptionRequest? req, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var ownerId = userId.Value.ToString();
        var sub = await _stripeDb.DainnStripeSubscriptions
            .Where(s => s.OwnerId == ownerId)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (sub is null)
        {
            return BadRequest(new { error = "You do not have an active subscription to cancel.", code = "no_subscription" });
        }

        if (sub.CancelAtPeriodEnd)
        {
            return BadRequest(new
            {
                error = "Your subscription has already been canceled.",
                code = "already_canceled",
                endDate = sub.CurrentPeriodEnd
            });
        }

        if (sub.Status is DainnStripeSubscriptionStatus.Canceled
                       or DainnStripeSubscriptionStatus.Unpaid
                       or DainnStripeSubscriptionStatus.PastDue)
        {
            return BadRequest(new { error = "Your subscription is no longer active.", code = "subscription_inactive" });
        }

        var stripeSubService = new SubscriptionService();
        try
        {
            await stripeSubService.UpdateAsync(sub.StripeSubscriptionId, new SubscriptionUpdateOptions
            {
                CancelAtPeriodEnd = true,
                CancellationDetails = new SubscriptionCancellationDetailsOptions
                {
                    Comment = req?.CancellationReason
                }
            }, cancellationToken: ct);
        }
        catch (StripeException ex)
        {
            _logger.LogError(ex, "Stripe cancel failed for subscription {SubId}", sub.StripeSubscriptionId);
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "Failed to cancel subscription with Stripe. Please try again.",
                code = "stripe_error"
            });
        }

        var tier = ResolveTier((await _roles.GetUserRolesAsync(userId.Value, ct)).Select(r => r.Name).ToList());
        await SendCancellationEmailAsync(userId.Value, tier, sub.CurrentPeriodEnd, ct);

        return Ok(new
        {
            canceled = true,
            endDate = sub.CurrentPeriodEnd,
            message = sub.CurrentPeriodEnd.HasValue
                ? $"Your subscription is canceled. You will retain access until {sub.CurrentPeriodEnd.Value:yyyy-MM-dd}."
                : "Your subscription is canceled. You will retain access until the end of your current billing period."
        });
    }

    private async Task SendCancellationEmailAsync(Guid userId, string tier, DateTime? endDate, CancellationToken ct)
    {
        var profile = await _profiles.GetProfileAsync(userId, ct);
        if (profile is null || string.IsNullOrWhiteSpace(profile.Email)) return;

        var fullName = string.IsNullOrWhiteSpace(profile.DisplayName) ? "there" : profile.DisplayName;
        var safeName = WebUtility.HtmlEncode(fullName);
        var safeTier = WebUtility.HtmlEncode(tier);
        var safeEndDate = endDate.HasValue
            ? endDate.Value.ToString("yyyy-MM-dd")
            : "the end of your current billing period";

        var htmlBody = $"""
            <p>Hi {safeName},</p>
            <p>You've successfully cancelled your Mindlex {safeTier} subscription. You will continue to have access to {safeTier} features until {safeEndDate}.</p>
            <p>No further charges will occur after this date.</p>
            <p>If this was a mistake, you can re-subscribe anytime from your Billing page.</p>
            <p>Thanks,<br/>The Mindlex Team</p>
            """;

        try
        {
            await _email.SendEmailAsync(
                profile.Email,
                fullName,
                "Your Mindlex Subscription Has Been Canceled",
                htmlBody,
                Array.Empty<EmailAttachment>(),
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send cancellation email to {Email}", profile.Email);
        }
    }

    [HttpPost("downgrade-to-plus")]
    public async Task<IActionResult> DowngradeToPlus(CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var ownerId = userId.Value.ToString();
        var sub = await _stripeDb.DainnStripeSubscriptions
            .Where(s => s.OwnerId == ownerId)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (sub is null)
            return BadRequest(new { error = "No active subscription to downgrade.", code = "no_subscription" });

        if (sub.Status is not DainnStripeSubscriptionStatus.Active and not DainnStripeSubscriptionStatus.Trialing)
            return BadRequest(new { error = "Subscription is not active.", code = "subscription_inactive" });

        if (sub.CancelAtPeriodEnd)
            return BadRequest(new { error = "Subscription is already scheduled to cancel.", code = "already_canceled" });

        var currentTier = ResolvePriceTier(sub.StripePriceId);
        if (!string.Equals(currentTier, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new
            {
                error = "You have already downgraded successfully before.",
                code = "already_downgraded"
            });
        }

        var (newPlusPriceId, cycle, currency) = FindMatchingPlusPriceId(sub.StripePriceId);
        if (string.IsNullOrWhiteSpace(newPlusPriceId))
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                error = "No matching Plus plan configured for current cycle/currency.",
                code = "plus_price_missing"
            });

        var stripeSubService = new SubscriptionService();
        Stripe.Subscription stripeSub;
        try
        {
            stripeSub = await stripeSubService.GetAsync(sub.StripeSubscriptionId, cancellationToken: ct);
            var itemId = stripeSub.Items?.Data?.FirstOrDefault()?.Id;
            if (string.IsNullOrWhiteSpace(itemId))
                return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Subscription item not found." });

            await stripeSubService.UpdateAsync(sub.StripeSubscriptionId, new SubscriptionUpdateOptions
            {
                Items = new List<SubscriptionItemOptions>
                {
                    new() { Id = itemId, Price = newPlusPriceId }
                },
                ProrationBehavior = "none"
            }, cancellationToken: ct);
        }
        catch (StripeException ex)
        {
            _logger.LogError(ex, "Stripe downgrade update failed for subscription {SubId}", sub.StripeSubscriptionId);
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "Failed to schedule downgrade with Stripe.",
                code = "stripe_error"
            });
        }

        await SendDowngradeEmailAsync(userId.Value, sub.CurrentPeriodEnd, ct);

        return Ok(new
        {
            scheduled = true,
            effectiveAt = sub.CurrentPeriodEnd,
            message = sub.CurrentPeriodEnd.HasValue
                ? $"Your downgrade to Plus is scheduled. Premium access remains until {sub.CurrentPeriodEnd.Value:yyyy-MM-dd}."
                : "Your downgrade to Plus is scheduled for the end of your current billing cycle."
        });
    }

    private async Task SendDowngradeEmailAsync(Guid userId, DateTime? endDate, CancellationToken ct)
    {
        var profile = await _profiles.GetProfileAsync(userId, ct);
        if (profile is null || string.IsNullOrWhiteSpace(profile.Email)) return;

        var fullName = string.IsNullOrWhiteSpace(profile.DisplayName) ? "there" : profile.DisplayName;
        var safeName = WebUtility.HtmlEncode(fullName);
        var safeEndDate = endDate.HasValue ? endDate.Value.ToString("yyyy-MM-dd") : "the end of your current billing cycle";

        var htmlBody = $"""
            <p>Hi {safeName},</p>
            <p>You've successfully scheduled a downgrade from your Mindlex Premium subscription to Mindlex Plus.</p>
            <p>Your Premium access will remain active until {safeEndDate}. After that, you will be charged the Plus plan rate and gain continued access to Plus features.</p>
            <p>If you have any questions, feel free to reach out.</p>
            <p>— The Mindlex Team</p>
            """;

        try
        {
            await _email.SendEmailAsync(
                profile.Email,
                fullName,
                "Your Mindlex Plan Will Downgrade to Plus",
                htmlBody,
                Array.Empty<EmailAttachment>(),
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send downgrade email to {Email}", profile.Email);
        }
    }

    private string? ResolvePriceTier(string? priceId)
    {
        if (string.IsNullOrWhiteSpace(priceId)) return null;
        var plans = _config.GetSection("Mindlex:Plans").Get<List<PlanOptions>>() ?? new();
        foreach (var plan in plans)
        {
            foreach (var pricing in plan.Pricing.Values)
            {
                if (string.Equals(pricing.StripeMonthlyPriceId, priceId, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(pricing.StripeAnnualPriceId, priceId, StringComparison.OrdinalIgnoreCase))
                    return plan.Tier;
            }
        }
        return null;
    }

    private (string? PriceId, string Cycle, string Currency) FindMatchingPlusPriceId(string? currentPremiumPriceId)
    {
        if (string.IsNullOrWhiteSpace(currentPremiumPriceId)) return (null, "", "");

        var plans = _config.GetSection("Mindlex:Plans").Get<List<PlanOptions>>() ?? new();
        var premiumPlan = plans.FirstOrDefault(p =>
            string.Equals(p.Tier, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase));
        var plusPlan = plans.FirstOrDefault(p =>
            string.Equals(p.Tier, RoleSeeder.PlusRoleName, StringComparison.OrdinalIgnoreCase));
        if (premiumPlan is null || plusPlan is null) return (null, "", "");

        foreach (var (currency, premiumPricing) in premiumPlan.Pricing)
        {
            if (string.Equals(premiumPricing.StripeMonthlyPriceId, currentPremiumPriceId, StringComparison.OrdinalIgnoreCase))
            {
                return plusPlan.Pricing.TryGetValue(currency, out var plus)
                    ? (plus.StripeMonthlyPriceId, "Monthly", currency)
                    : (null, "Monthly", currency);
            }
            if (string.Equals(premiumPricing.StripeAnnualPriceId, currentPremiumPriceId, StringComparison.OrdinalIgnoreCase))
            {
                return plusPlan.Pricing.TryGetValue(currency, out var plus)
                    ? (plus.StripeAnnualPriceId, "Annual", currency)
                    : (null, "Annual", currency);
            }
        }
        return (null, "", "");
    }

    private static string ResolveTier(IList<string> roleNames)
    {
        if (roleNames.Any(r => string.Equals(r, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase)))
            return RoleSeeder.PremiumRoleName;
        if (roleNames.Any(r => string.Equals(r, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase)))
            return RoleSeeder.PremiumRoleName;
        if (roleNames.Any(r => string.Equals(r, RoleSeeder.PlusRoleName, StringComparison.OrdinalIgnoreCase)))
            return RoleSeeder.PlusRoleName;
        return RoleSeeder.FreeRoleName;
    }
}
