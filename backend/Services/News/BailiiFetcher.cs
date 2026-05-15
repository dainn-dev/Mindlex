using Mindlex.Data;

namespace Mindlex.Services.News;

public sealed class BailiiFetcher : INewsSourceFetcher
{
    public string SourceName => "Bailii";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<BailiiFetcher> _logger;

    public BailiiFetcher(IHttpClientFactory httpClientFactory, ILogger<BailiiFetcher> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    public Task<IReadOnlyList<NewsArticle>> FetchAsync(DateTime sinceUtc, CancellationToken ct)
    {
        // TODO: pull from BAILII's:
        //   - https://www.bailii.org/recent-decisions.html
        //   - https://www.bailii.org/recent-additions.html
        //   - https://www.bailii.org/cases_of_interest.html
        // BAILII offers RSS at https://www.bailii.org/cgi-bin/atom.cgi (per-court)
        // Window: sinceUtc → now. Summarize + classify via LLM.
        _logger.LogDebug("BailiiFetcher stub — no articles fetched.");
        return Task.FromResult<IReadOnlyList<NewsArticle>>(Array.Empty<NewsArticle>());
    }
}
