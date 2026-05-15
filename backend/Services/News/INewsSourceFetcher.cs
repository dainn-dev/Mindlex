using Mindlex.Data;

namespace Mindlex.Services.News;

public interface INewsSourceFetcher
{
    string SourceName { get; }
    Task<IReadOnlyList<NewsArticle>> FetchAsync(DateTime sinceUtc, CancellationToken ct);
}
