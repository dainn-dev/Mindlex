using System.ComponentModel.DataAnnotations;

namespace MyLaw.Models;

public class StartSubscriptionRequest
{
    [Required(ErrorMessage = "Stripe price ID is required.")]
    [StringLength(64, MinimumLength = 4, ErrorMessage = "Stripe price ID has invalid length.")]
    [RegularExpression(@"^price_[A-Za-z0-9]+$", ErrorMessage = "Stripe price ID must start with 'price_'.")]
    public string PriceId { get; set; } = string.Empty;

    [Required(ErrorMessage = "Success URL is required.")]
    [Url(ErrorMessage = "Success URL must be a valid absolute URL.")]
    [StringLength(2048)]
    public string SuccessUrl { get; set; } = string.Empty;

    [Required(ErrorMessage = "Cancel URL is required.")]
    [Url(ErrorMessage = "Cancel URL must be a valid absolute URL.")]
    [StringLength(2048)]
    public string CancelUrl { get; set; } = string.Empty;
}

/// <summary>
/// Cancel request body is OPTIONAL (the endpoint resolves the current user's
/// latest subscription server-side). Caller may provide an optional free-text
/// cancellation reason for analytics. SubscriptionId is accepted but ignored.
/// </summary>
public class CancelSubscriptionRequest
{
    [StringLength(128)]
    public string? SubscriptionId { get; set; }

    [StringLength(1000, ErrorMessage = "Cancellation reason must be at most 1000 characters.")]
    public string? CancellationReason { get; set; }
}
