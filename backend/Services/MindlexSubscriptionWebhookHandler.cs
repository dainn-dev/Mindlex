using System.Net;
using DainnStripe.Data;
using DainnStripe.Entities;
using DainnStripe.Interfaces;
using DainnUser.Core.Interfaces.Services;
using Microsoft.EntityFrameworkCore;
using Mindlex.Controllers;
using Stripe;
using EmailAttachment = DainnUser.Core.Interfaces.Services.EmailAttachment;

namespace Mindlex.Services;

public sealed class MindlexSubscriptionWebhookHandler : IStripeWebhookHandler
{
    private static readonly string[] SubscriptionEvents =
    {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted"
    };

    private readonly DainnStripeDbContext _stripeDb;
    private readonly IRoleService _roles;
    private readonly IProfileService _profiles;
    private readonly IEmailService _email;
    private readonly IConfiguration _config;
    private readonly ILogger<MindlexSubscriptionWebhookHandler> _logger;

    public MindlexSubscriptionWebhookHandler(
        DainnStripeDbContext stripeDb,
        IRoleService roles,
        IProfileService profiles,
        IEmailService email,
        IConfiguration config,
        ILogger<MindlexSubscriptionWebhookHandler> logger)
    {
        _stripeDb = stripeDb;
        _roles = roles;
        _profiles = profiles;
        _email = email;
        _config = config;
        _logger = logger;
    }

    public bool CanHandle(string eventType)
    {
        return SubscriptionEvents.Contains(eventType) || eventType == "invoice.paid";
    }

    public async Task HandleAsync(Event stripeEvent, StripeWebhookEventRecord record, CancellationToken ct)
    {
        try
        {
            if (stripeEvent.Type == "invoice.paid")
            {
                if (stripeEvent.Data.Object is Invoice invoice)
                    await HandleInvoicePaidAsync(invoice, ct);
                return;
            }

            if (stripeEvent.Data.Object is not Subscription sub) return;
            var userId = await ResolveOwnerIdAsync(sub.CustomerId, ct);
            if (userId is null)
            {
                _logger.LogWarning(
                    "Could not resolve owner for Stripe customer {CustomerId} on event {EventType}",
                    sub.CustomerId, stripeEvent.Type);
                return;
            }

            if (stripeEvent.Type == "customer.subscription.deleted" || sub.Status is "canceled" or "incomplete_expired")
            {
                await SwapToTierAsync(userId.Value, RoleSeeder.FreeRoleName, ct);
                return;
            }

            if (sub.Status is "active" or "trialing")
            {
                var priceId = sub.Items?.Data?.FirstOrDefault()?.Price?.Id;
                if (string.IsNullOrWhiteSpace(priceId)) return;

                var newTier = ResolveTierFromPriceId(priceId);
                if (newTier is null) return;

                var currentRoles = (await _roles.GetUserRolesAsync(userId.Value, ct))
                    .Select(r => r.Name).ToList();
                var currentTier = ResolveCurrentTier(currentRoles);

                if (TierLevel(newTier) < TierLevel(currentTier))
                {
                    _logger.LogInformation(
                        "Skipping role downgrade for user {UserId} (new tier {NewTier} < current {CurrentTier}). " +
                        "Will swap when next invoice.paid fires at renewal.",
                        userId.Value, newTier, currentTier);
                    return;
                }

                await SwapToTierAsync(userId.Value, newTier, ct);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "MindlexSubscriptionWebhookHandler failed for event {EventType}", stripeEvent.Type);
            throw;
        }
    }

    private async Task HandleInvoicePaidAsync(Invoice invoice, CancellationToken ct)
    {
        if (invoice.AmountPaid <= 0) return;

        var userId = await ResolveOwnerIdAsync(invoice.CustomerId, ct);
        if (userId is null) return;

        var subRow = await _stripeDb.DainnStripeSubscriptions
            .Where(s => s.StripeCustomerId == invoice.CustomerId)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(ct);
        var priceId = subRow?.StripePriceId;

        var tier = priceId is null ? null : ResolveTierFromPriceId(priceId);
        if (tier is null) return;

        await SwapToTierAsync(userId.Value, tier, ct);

        var profile = await _profiles.GetProfileAsync(userId.Value, ct);
        if (profile is null || string.IsNullOrWhiteSpace(profile.Email)) return;
        var fullName = string.IsNullOrWhiteSpace(profile.DisplayName) ? "there" : profile.DisplayName;
        var safeName = WebUtility.HtmlEncode(fullName);

        var subject = tier == RoleSeeder.PremiumRoleName
            ? "Welcome to Mindlex Premium – Your Subscription is Active"
            : "Welcome to Mindlex Plus – Your Subscription is Active";

        var tierLabel = tier == RoleSeeder.PremiumRoleName ? "Mindlex Premium" : "Mindlex Plus";
        var chatUrl = _config.GetValue<string>("Mindlex:ChatbotUrl") ?? "https://mindlex.ai/";

        var htmlBody = $"""
            <p>Hi {safeName},</p>
            <p>Thank you for subscribing to {tierLabel}. Your payment was successful and your subscription is now active.</p>
            <p>You now have full access to {tierLabel}.</p>
            <p>If you have any questions, feel free to contact our support team.</p>
            <p><a href="{WebUtility.HtmlEncode(chatUrl)}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Start Using Mindlex</a></p>
            """;

        try
        {
            await _email.SendEmailAsync(
                profile.Email,
                fullName,
                subject,
                htmlBody,
                Array.Empty<EmailAttachment>(),
                ct);
            _logger.LogInformation("Sent payment confirmation email to {Email} for tier {Tier}", profile.Email, tier);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send payment confirmation email to {Email}", profile.Email);
        }
    }

    private async Task<Guid?> ResolveOwnerIdAsync(string? stripeCustomerId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(stripeCustomerId)) return null;

        var mapping = await _stripeDb.StripeCustomerMappings
            .FirstOrDefaultAsync(m => m.StripeCustomerId == stripeCustomerId, ct);

        if (mapping is null) return null;
        return Guid.TryParse(mapping.OwnerId, out var id) ? id : null;
    }

    private string? ResolveTierFromPriceId(string priceId)
    {
        var plans = _config.GetSection("Mindlex:Plans").Get<List<PlanOptions>>() ?? new();

        foreach (var plan in plans)
        {
            foreach (var pricing in plan.Pricing.Values)
            {
                if (string.Equals(pricing.StripeMonthlyPriceId, priceId, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(pricing.StripeAnnualPriceId, priceId, StringComparison.OrdinalIgnoreCase))
                {
                    return plan.Tier;
                }
            }
        }

        _logger.LogWarning("No tier mapping found for Stripe price {PriceId}", priceId);
        return null;
    }

    private static string ResolveCurrentTier(IList<string> roleNames)
    {
        if (roleNames.Any(r => string.Equals(r, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase)))
            return RoleSeeder.PremiumRoleName;
        if (roleNames.Any(r => string.Equals(r, RoleSeeder.PlusRoleName, StringComparison.OrdinalIgnoreCase)))
            return RoleSeeder.PlusRoleName;
        return RoleSeeder.FreeRoleName;
    }

    private static int TierLevel(string tier) => tier switch
    {
        RoleSeeder.PremiumRoleName => 2,
        RoleSeeder.PlusRoleName => 1,
        _ => 0
    };

    private async Task SwapToTierAsync(Guid userId, string newTier, CancellationToken ct)
    {
        var allRoles = await _roles.GetAllRolesAsync(ct);
        var roleByName = allRoles.ToDictionary(r => r.Name, r => r, StringComparer.OrdinalIgnoreCase);

        if (!roleByName.TryGetValue(newTier, out var newRole))
        {
            _logger.LogWarning("Role '{Tier}' not found when handling Stripe event for user {UserId}.", newTier, userId);
            return;
        }

        var current = (await _roles.GetUserRolesAsync(userId, ct)).ToList();

        foreach (var roleName in RoleSeeder.SubscriptionRoles)
        {
            if (string.Equals(roleName, newTier, StringComparison.OrdinalIgnoreCase)) continue;
            var existing = current.FirstOrDefault(r => string.Equals(r.Name, roleName, StringComparison.OrdinalIgnoreCase));
            if (existing is not null)
            {
                await _roles.RemoveRoleFromUserAsync(userId, existing.Id, ct);
            }
        }

        await _roles.AssignRoleToUserAsync(userId, newRole.Id, ct);
        _logger.LogInformation("User {UserId} role swapped to {Tier} via Stripe webhook.", userId, newTier);
    }
}
