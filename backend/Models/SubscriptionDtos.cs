namespace Mindlex.Models;

public record StartSubscriptionRequest(string PriceId, string SuccessUrl, string CancelUrl);

public record CancelSubscriptionRequest(string SubscriptionId, string? CancellationReason);
