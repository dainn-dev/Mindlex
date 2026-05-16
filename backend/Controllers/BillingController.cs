using System.Globalization;
using System.Security.Claims;
using DainnStripe.Data;
using DainnStripe.Enums;
using DainnUser.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Mindlex.Services;
using Stripe;

namespace Mindlex.Controllers;

[ApiController]
[Authorize]
[Route("api/billing")]
public class BillingController : ControllerBase
{
    private readonly IRoleService _roles;
    private readonly DainnStripeDbContext _stripeDb;
    private readonly IConfiguration _config;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<BillingController> _logger;

    public BillingController(
        IRoleService roles,
        DainnStripeDbContext stripeDb,
        IConfiguration config,
        IHttpClientFactory httpClientFactory,
        ILogger<BillingController> logger)
    {
        _roles = roles;
        _stripeDb = stripeDb;
        _config = config;
        _httpClientFactory = httpClientFactory;
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

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus(CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var ownerId = userId.Value.ToString();
        var roleNames = (await _roles.GetUserRolesAsync(userId.Value, ct)).Select(r => r.Name).ToList();
        var currentTier = ResolveTier(roleNames);

        var latestSub = await _stripeDb.DainnStripeSubscriptions
            .Where(s => s.OwnerId == ownerId)
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefaultAsync(ct);

        var lastPaidPayment = await _stripeDb.DainnStripePayments
            .Where(p => p.OwnerId == ownerId && p.Status == DainnStripePaymentStatus.Succeeded)
            .OrderByDescending(p => p.CreatedAt)
            .FirstOrDefaultAsync(ct);

        var previousTier = latestSub is null ? null : ResolveTierFromPriceId(latestSub.StripePriceId);

        string statusLabel;
        string roleDisplay = $"{currentTier} User";
        DateTime? nextPaymentDue = null;
        DateTime? lastPaymentDate = lastPaidPayment?.CreatedAt;
        string? message = null;
        bool showUpgrade = false;

        // Admin accounts have permanent Premium access without a Stripe subscription
        var isAdmin = roleNames.Any(r => string.Equals(r, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase));
        if (isAdmin)
        {
            return Ok(new
            {
                currentRole = "Admin (Premium)",
                status = "Active",
                nextPaymentDue = (DateTime?)null,
                lastPaymentDate = (DateTime?)null,
                message = (string?)null,
                showUpgradeButton = false
            });
        }

        if (string.Equals(currentTier, RoleSeeder.FreeRoleName, StringComparison.OrdinalIgnoreCase))
        {
            var paidEndedRecently =
                latestSub is not null
                && IsSubscriptionTerminal(latestSub.Status)
                && previousTier is not null
                && !string.Equals(previousTier, RoleSeeder.FreeRoleName, StringComparison.OrdinalIgnoreCase);

            if (paidEndedRecently)
            {
                statusLabel = "Expired";
                message = $"Your {previousTier} access has ended.";
            }
            else
            {
                statusLabel = "Active";
            }
            showUpgrade = true;
        }
        else
        {
            var subStatus = latestSub?.Status;
            var cancelAtPeriodEnd = latestSub?.CancelAtPeriodEnd ?? false;
            var periodEnd = latestSub?.CurrentPeriodEnd;

            if (subStatus is DainnStripeSubscriptionStatus.Active or DainnStripeSubscriptionStatus.Trialing
                && !cancelAtPeriodEnd)
            {
                statusLabel = "Active";
                nextPaymentDue = periodEnd;
            }
            else if (subStatus is DainnStripeSubscriptionStatus.Active or DainnStripeSubscriptionStatus.Trialing
                     && cancelAtPeriodEnd)
            {
                statusLabel = "Canceled";
                message = periodEnd.HasValue
                    ? $"Your access remains active until {periodEnd.Value:yyyy-MM-dd}."
                    : "Your access remains active until the end of the current billing period.";
            }
            else
            {
                statusLabel = "Expired";
                message = $"Your {currentTier} access has ended.";
                showUpgrade = true;
                nextPaymentDue = null;
            }
        }

        return Ok(new
        {
            currentRole = roleDisplay,
            status = statusLabel,
            nextPaymentDue,
            lastPaymentDate,
            message,
            showUpgradeButton = showUpgrade
        });
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

    private string? ResolveTierFromPriceId(string? priceId)
    {
        if (string.IsNullOrWhiteSpace(priceId)) return null;

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
        return null;
    }

    private static bool IsSubscriptionTerminal(DainnStripeSubscriptionStatus status)
    {
        return status is DainnStripeSubscriptionStatus.Canceled
            or DainnStripeSubscriptionStatus.Unpaid
            or DainnStripeSubscriptionStatus.PastDue;
    }

    [HttpGet("payments")]
    public async Task<IActionResult> ListPayments(CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var ownerId = userId.Value.ToString();
        var payments = await _stripeDb.DainnStripePayments
            .Where(p => p.OwnerId == ownerId)
            .OrderByDescending(p => p.CreatedAt)
            .AsNoTracking()
            .ToListAsync(ct);

        var subscriptions = await _stripeDb.DainnStripeSubscriptions
            .Where(s => s.OwnerId == ownerId)
            .OrderBy(s => s.CreatedAt)
            .AsNoTracking()
            .ToListAsync(ct);

        var records = payments.Select(p =>
        {
            var sub = ResolveSubscriptionForPayment(p, subscriptions);
            var planLabel = sub is null ? null : BuildPlanLabel(sub.StripePriceId);
            var mindlexStatus = MapStatus(p.Status);

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
                isPaid = mindlexStatus == "Paid",
                invoiceDownloadUrl = mindlexStatus == "Paid"
                    ? $"/api/billing/payments/{p.Id}/invoice-pdf"
                    : null
            };
        }).ToList();

        return Ok(new
        {
            count = records.Count,
            emptyMessage = records.Count == 0 ? "No payment records found." : null,
            payments = records
        });
    }

    [HttpGet("payments/{paymentId:guid}/invoice-pdf")]
    public async Task<IActionResult> DownloadInvoicePdf(Guid paymentId, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var ownerId = userId.Value.ToString();
        var payment = await _stripeDb.DainnStripePayments
            .FirstOrDefaultAsync(p => p.Id == paymentId && p.OwnerId == ownerId, ct);

        if (payment is null) return NotFound(new { error = "Payment not found." });
        if (payment.Status != DainnStripePaymentStatus.Succeeded)
            return BadRequest(new { error = "Invoice is only available for successful payments.", code = "not_paid" });

        var candidates = await _stripeDb.DainnStripeInvoices
            .Where(i => i.OwnerId == ownerId)
            .AsNoTracking()
            .ToListAsync(ct);

        var invoice = candidates
            .Where(i => i.AmountPaid == payment.Amount)
            .OrderBy(i => Math.Abs((i.CreatedAt - payment.CreatedAt).TotalMinutes))
            .FirstOrDefault()
            ?? candidates.OrderByDescending(i => i.CreatedAt).FirstOrDefault();

        var pdfUrl = invoice?.InvoicePdfUrl;
        if (string.IsNullOrWhiteSpace(pdfUrl))
            return NotFound(new { error = "PDF not available yet. Try again shortly.", code = "pdf_unavailable" });

        var transactionId = BuildTransactionId(invoice, payment);
        var fileName = $"Invoice_{transactionId}.pdf";

        try
        {
            var client = _httpClientFactory.CreateClient();
            using var response = await client.GetAsync(pdfUrl, HttpCompletionOption.ResponseHeadersRead, ct);
            response.EnsureSuccessStatusCode();
            var bytes = await response.Content.ReadAsByteArrayAsync(ct);
            return File(bytes, "application/pdf", fileName);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Failed to download invoice PDF from Stripe for payment {PaymentId}", paymentId);
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "Could not retrieve invoice PDF from Stripe.",
                code = "stripe_pdf_fetch_failed"
            });
        }
    }

    private static string BuildTransactionId(DainnStripe.Entities.DainnStripeInvoice? invoice, DainnStripe.Entities.DainnStripePayment payment)
    {
        if (!string.IsNullOrWhiteSpace(invoice?.StripeInvoiceId))
        {
            var sid = invoice.StripeInvoiceId.StartsWith("in_", StringComparison.OrdinalIgnoreCase)
                ? invoice.StripeInvoiceId.Substring(3)
                : invoice.StripeInvoiceId;
            if (!string.IsNullOrWhiteSpace(sid)) return sid;
        }
        return payment.Id.ToString("N");
    }

    private static DainnStripe.Entities.DainnStripeSubscription? ResolveSubscriptionForPayment(
        DainnStripe.Entities.DainnStripePayment payment,
        IReadOnlyList<DainnStripe.Entities.DainnStripeSubscription> subscriptions)
    {
        var precedingOrCurrent = subscriptions
            .Where(s => s.CreatedAt <= payment.CreatedAt.AddDays(7))
            .OrderByDescending(s => s.CreatedAt)
            .FirstOrDefault();

        return precedingOrCurrent ?? subscriptions.LastOrDefault();
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

    private static string MapStatus(DainnStripePaymentStatus status) => status switch
    {
        DainnStripePaymentStatus.Succeeded => "Paid",
        DainnStripePaymentStatus.Pending => "Pending",
        _ => "Not Paid"
    };

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
}
