using Mindlex.Data;

namespace Mindlex.Services.News;

public sealed class CuriaFetcher : INewsSourceFetcher
{
    public string SourceName => "Curia";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<CuriaFetcher> _logger;

    public CuriaFetcher(IHttpClientFactory httpClientFactory, ILogger<CuriaFetcher> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public Task<IReadOnlyList<NewsArticle>> FetchAsync(DateTime sinceUtc, CancellationToken ct)
    {
        // TODO: pull from Curia (ECJ):
        //   - https://curia.europa.eu/jcms/jcms/Jo2_7052/en/ (Press releases)
        //   - RSS available: https://curia.europa.eu/jcms/upload/docs/application/xml/...
        // Window: sinceUtc → now. Summarize + classify.
        _logger.LogDebug("CuriaFetcher stub — no articles fetched.");
        return Task.FromResult<IReadOnlyList<NewsArticle>>(Array.Empty<NewsArticle>());
    }
}
