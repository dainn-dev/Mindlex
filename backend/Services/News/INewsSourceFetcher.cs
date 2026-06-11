using MyLaw.Data;

namespace MyLaw.Services.News;

public interface INewsSourceFetcher
{
    string SourceName { get; }
    Task<IReadOnlyList<NewsArticle>> FetchAsync(DateTime sinceUtc, CancellationToken ct);
}
