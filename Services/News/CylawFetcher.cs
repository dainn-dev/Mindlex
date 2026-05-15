using Mindlex.Data;

namespace Mindlex.Services.News;

public sealed class CylawFetcher : INewsSourceFetcher
{
    public string SourceName => "Cylaw";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<CylawFetcher> _logger;

    public CylawFetcher(IHttpClientFactory httpClientFactory, ILogger<CylawFetcher> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public Task<IReadOnlyList<NewsArticle>> FetchAsync(DateTime sinceUtc, CancellationToken ct)
    {
        // TODO: scrape https://www.cylaw.org/ "News & Additions" section
        // Parse listing → for each entry within sinceUtc window:
        //   - fetch detail page
        //   - summarize via LLM (apply LC10 prompt rules)
        //   - classify into topics (LU1 list)
        //   - construct NewsArticle entity
        // Dedup by SourceUrl in caller
        _logger.LogDebug("CylawFetcher stub — no articles fetched.");
        return Task.FromResult<IReadOnlyList<NewsArticle>>(Array.Empty<NewsArticle>());
    }
}
