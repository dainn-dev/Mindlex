using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MyLaw.Controllers;

public sealed class PriceTier
{
    public long MonthlyPriceCents { get; set; }
    public long AnnualPriceCents { get; set; }
    public string? StripeMonthlyPriceId { get; set; }
    public string? StripeAnnualPriceId { get; set; }
}

public sealed class PlanOptions
{
    public string Tier { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public Dictionary<string, PriceTier> Pricing { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public List<string> Features { get; set; } = new();
}

[ApiController]
[AllowAnonymous]
[Route("api/plans")]
public class PlansController : ControllerBase
{
    private readonly IConfiguration _config;

    public PlansController(IConfiguration config)
    {
        _config = config;
    }

    [HttpGet]
    public IActionResult List([FromQuery] string? currency = null)
    {
        var supported = _config.GetSection("MyLaw:SupportedCurrencies").Get<string[]>()
            ?? new[] { "EUR", "GBP", "USD" };
        var defaultCurrency = _config.GetValue<string>("MyLaw:DefaultCurrency") ?? "EUR";

        var requested = (currency ?? defaultCurrency).ToUpperInvariant();
        if (!supported.Contains(requested, StringComparer.OrdinalIgnoreCase))
        {
            return BadRequest(new
            {
                error = $"Currency '{currency}' is not supported.",
                supportedCurrencies = supported
            });
        }

        var plans = _config.GetSection("MyLaw:Plans").Get<List<PlanOptions>>() ?? new();

        var display = plans.Select(p =>
        {
            var pricing = p.Pricing.TryGetValue(requested, out var t) ? t : new PriceTier();
            return new
            {
                tier = p.Tier,
                displayName = p.DisplayName,
                currency = requested,
                monthly = new
                {
                    priceCents = pricing.MonthlyPriceCents,
                    price = pricing.MonthlyPriceCents / 100m,
                    stripePriceId = pricing.StripeMonthlyPriceId
                },
                annual = new
                {
                    priceCents = pricing.AnnualPriceCents,
                    price = pricing.AnnualPriceCents / 100m,
                    stripePriceId = pricing.StripeAnnualPriceId,
                    annualSavingsCents = Math.Max(0, pricing.MonthlyPriceCents * 12 - pricing.AnnualPriceCents),
                    annualSavingsPercent = pricing.MonthlyPriceCents == 0
                        ? 0
                        : Math.Round(100m * (pricing.MonthlyPriceCents * 12 - pricing.AnnualPriceCents) / (pricing.MonthlyPriceCents * 12m), 1)
                },
                features = p.Features,
                isFree = pricing.MonthlyPriceCents == 0
            };
        });

        return Ok(new
        {
            requestedCurrency = requested,
            supportedCurrencies = supported,
            plans = display
        });
    }
}
