using System.Globalization;
using System.Net;
using System.Xml.Linq;
using Mindlex.Data;

namespace Mindlex.Services.News;

/// <summary>
/// Base class for RSS / Atom feed-driven news source fetchers.
/// Subclasses configure feed URL(s) + topic classification heuristics.
/// </summary>
public abstract class RssFetcherBase : INewsSourceFetcher
{
    private static readonly TimeSpan HttpTimeout = TimeSpan.FromSeconds(30);

    protected readonly IHttpClientFactory HttpClientFactory;
    protected readonly IConfiguration Config;
    protected readonly ILogger Logger;

    protected RssFetcherBase(IHttpClientFactory httpClientFactory, IConfiguration config, ILogger logger)
    {
        HttpClientFactory = httpClientFactory;
        Config = config;
        Logger = logger;
    }

    public abstract string SourceName { get; }

    /// <summary>Configuration key under Mindlex:LegalNews:FeedUrls (e.g. "Bailii").</summary>
    protected abstract string FeedKey { get; }

    /// <summary>Map a (title + summary) blob to a list of canonical topic names.</summary>
    protected virtual IEnumerable<string> ClassifyTopics(string title, string summary)
    {
        var lower = (title + " " + summary).ToLowerInvariant();
        var keywords = Config
            .GetSection("Mindlex:ContentManagement:ClassificationKeywords")
            .GetChildren();
        foreach (var topic in keywords)
        {
            var words = topic.Get<string[]>() ?? Array.Empty<string>();
            if (words.Any(w => lower.Contains(w, StringComparison.OrdinalIgnoreCase)))
                yield return topic.Key;
        }
    }

    public async Task<IReadOnlyList<NewsArticle>> FetchAsync(DateTime sinceUtc, CancellationToken ct)
    {
        var urls = Config
            .GetSection($"Mindlex:LegalNews:FeedUrls:{FeedKey}")
            .Get<string[]>() ?? Array.Empty<string>();
        if (urls.Length == 0)
        {
            Logger.LogInformation(
                "{Source} fetcher: no feed URLs configured under Mindlex:LegalNews:FeedUrls:{Key}.",
                SourceName, FeedKey);
            return Array.Empty<NewsArticle>();
        }

        var client = HttpClientFactory.CreateClient("news");
        client.Timeout = HttpTimeout;
        client.DefaultRequestHeaders.UserAgent.Clear();
        client.DefaultRequestHeaders.UserAgent.ParseAdd("MindlexNewsBot/1.0 (+https://mindlex.ai)");

        var articles = new List<NewsArticle>();
        foreach (var url in urls)
        {
            try
            {
                using var resp = await client.GetAsync(url, ct);
                if (!resp.IsSuccessStatusCode)
                {
                    Logger.LogWarning("{Source} feed {Url} returned {Status}.", SourceName, url, (int)resp.StatusCode);
                    continue;
                }
                var content = await resp.Content.ReadAsStringAsync(ct);
                var parsed = ParseFeed(content, sinceUtc);
                articles.AddRange(parsed);
            }
            catch (TaskCanceledException)
            {
                Logger.LogWarning("{Source} feed {Url} timed out.", SourceName, url);
            }
            catch (Exception ex)
            {
                Logger.LogError(ex, "{Source} feed {Url} failed.", SourceName, url);
            }
        }
        return articles;
    }

    /// <summary>Parses RSS 2.0 OR Atom XML into NewsArticle entities, filtering by sinceUtc.</summary>
    protected virtual IEnumerable<NewsArticle> ParseFeed(string xml, DateTime sinceUtc)
    {
        XDocument doc;
        try { doc = XDocument.Parse(xml); }
        catch (Exception ex)
        {
            Logger.LogWarning(ex, "{Source}: failed to parse feed XML.", SourceName);
            yield break;
        }

        foreach (var item in doc.Descendants("item"))
        {
            var title = item.Element("title")?.Value?.Trim();
            var link = item.Element("link")?.Value?.Trim();
            var desc = item.Element("description")?.Value?.Trim() ?? string.Empty;
            var pub = ParseDate(item.Element("pubDate")?.Value);
            if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(link)) continue;
            if (pub.HasValue && pub.Value < sinceUtc) continue;
            yield return BuildArticle(title!, WebUtility.HtmlDecode(StripHtml(desc)), link!, pub);
        }

        XNamespace atom = "http://www.w3.org/2005/Atom";
        foreach (var entry in doc.Descendants(atom + "entry"))
        {
            var title = entry.Element(atom + "title")?.Value?.Trim();
            var link = entry.Element(atom + "link")?.Attribute("href")?.Value?.Trim();
            var summary = entry.Element(atom + "summary")?.Value?.Trim()
                          ?? entry.Element(atom + "content")?.Value?.Trim()
                          ?? string.Empty;
            var pub = ParseDate(entry.Element(atom + "updated")?.Value
                                ?? entry.Element(atom + "published")?.Value);
            if (string.IsNullOrWhiteSpace(title) || string.IsNullOrWhiteSpace(link)) continue;
            if (pub.HasValue && pub.Value < sinceUtc) continue;
            yield return BuildArticle(title!, WebUtility.HtmlDecode(StripHtml(summary)), link!, pub);
        }
    }

    protected virtual NewsArticle BuildArticle(string title, string summary, string url, DateTime? publishedAt)
    {
        var trimmedSummary = summary.Length > 1000 ? summary[..1000] : summary;
        var topics = ClassifyTopics(title, trimmedSummary).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        return new NewsArticle
        {
            Id = Guid.NewGuid(),
            Source = SourceName,
            Headline = title.Length > 500 ? title[..500] : title,
            Summary = trimmedSummary,
            SourceUrl = url,
            PublishedAt = publishedAt,
            TopicsCsv = string.Join(",", topics)
        };
    }

    protected static DateTime? ParseDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var dt))
            return dt.ToUniversalTime();
        return null;
    }

    protected static string StripHtml(string input)
    {
        if (string.IsNullOrEmpty(input)) return string.Empty;
        return System.Text.RegularExpressions.Regex.Replace(input, "<.*?>", " ")
            .Replace("&nbsp;", " ")
            .Trim();
    }
}
