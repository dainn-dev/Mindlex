using Mindlex.Data;

namespace Mindlex.Services.News;

public sealed class EchrFetcher : INewsSourceFetcher
{
    public string SourceName => "ECHR";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<EchrFetcher> _logger;

    public EchrFetcher(IHttpClientFactory httpClientFactory, ILogger<EchrFetcher> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public Task<IReadOnlyList<NewsArticle>> FetchAsync(DateTime sinceUtc, CancellationToken ct)
    {
        // TODO: pull from ECHR:
        //   - https://www.echr.coe.int/ (Home — recent)
        //   - https://hudoc.echr.coe.int/ (Grand Chamber & Chamber filter)
        // HUDOC REST API: https://hudoc.echr.coe.int/app/query/results?...
        // Use HUDOC search with date filter + chamber filter.
        _logger.LogDebug("EchrFetcher stub — no articles fetched.");
        return Task.FromResult<IReadOnlyList<NewsArticle>>(Array.Empty<NewsArticle>());
    }
}
