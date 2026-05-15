using System.Text.RegularExpressions;
using Mindlex.Data;

namespace Mindlex.Services.News;

/// <summary>
/// Cylaw fetcher: scrapes the Cylaw "News &amp; Additions" listing page(s).
/// Pages are static HTML; we extract anchor tags whose text or href maps to
/// a case-law document. Listing URLs configured under
///   Mindlex:LegalNews:FeedUrls:Cylaw (string[]).
/// </summary>
public sealed class CylawFetcher : INewsSourceFetcher
{
    public string SourceName => "Cylaw";

    private static readonly Regex AnchorRegex = new(
        @"<a\s+[^>]*href=""([^""]+)""[^>]*>(.*?)</a>",
        RegexOptions.IgnoreCase | RegexOptions.Singleline);

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<CylawFetcher> _logger;

    public CylawFetcher(IHttpClientFactory httpClientFactory, IConfiguration config, ILogger<CylawFetcher> logger)
    {
        _httpClientFactory = httpClientFactory;
        _config = config;
        _logger = logger;
    }

    public async Task<IReadOnlyList<NewsArticle>> FetchAsync(DateTime sinceUtc, CancellationToken ct)
    {
        var urls = _config
            .GetSection("Mindlex:LegalNews:FeedUrls:Cylaw")
            .Get<string[]>() ?? Array.Empty<string>();
        if (urls.Length == 0)
        {
            _logger.LogInformation("Cylaw fetcher: no listing URLs configured.");
            return Array.Empty<NewsArticle>();
        }

        var client = _httpClientFactory.CreateClient("news");
        client.Timeout = TimeSpan.FromSeconds(30);
        client.DefaultRequestHeaders.UserAgent.Clear();
        client.DefaultRequestHeaders.UserAgent.ParseAdd("MindlexNewsBot/1.0 (+https://mindlex.ai)");

        var keywordsSection = _config.GetSection("Mindlex:ContentManagement:ClassificationKeywords").GetChildren();
        var topicKeywords = keywordsSection.ToDictionary(
            s => s.Key,
            s => s.Get<string[]>() ?? Array.Empty<string>(),
            StringComparer.OrdinalIgnoreCase);

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var results = new List<NewsArticle>();
        foreach (var url in urls)
        {
            try
            {
                using var resp = await client.GetAsync(url, ct);
                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Cylaw {Url} returned {Status}.", url, (int)resp.StatusCode);
                    continue;
                }
                var html = await resp.Content.ReadAsStringAsync(ct);

                foreach (Match m in AnchorRegex.Matches(html))
                {
                    var href = m.Groups[1].Value.Trim();
                    var label = StripHtml(m.Groups[2].Value).Trim();
                    if (string.IsNullOrWhiteSpace(href) || string.IsNullOrWhiteSpace(label)) continue;
                    if (!href.StartsWith("http", StringComparison.OrdinalIgnoreCase))
                    {
                        if (!Uri.TryCreate(new Uri(url), href, out var abs)) continue;
                        href = abs.ToString();
                    }
                    if (!href.Contains("cylaw.org", StringComparison.OrdinalIgnoreCase)) continue;
                    if (!seen.Add(href)) continue;
                    if (label.Length < 8) continue; // skip nav-bar links

                    var topics = topicKeywords
                        .Where(kv => kv.Value.Any(w => label.Contains(w, StringComparison.OrdinalIgnoreCase)))
                        .Select(kv => kv.Key)
                        .ToList();

                    var headline = label.Length > 500 ? label[..500] : label;
                    var summary = label.Length > 1000 ? label[..1000] : label;

                    // Cylaw listing pages typically don't expose per-row dates
                    // in stable markup; we leave PublishedAt null and fall back
                    // to IngestedAt (auto-set by NewsIngestionService).
                    _ = sinceUtc; // sinceUtc not used for filtering since dates unknown
                    results.Add(new NewsArticle
                    {
                        Id = Guid.NewGuid(),
                        Source = SourceName,
                        Headline = headline,
                        Summary = summary,
                        SourceUrl = href,
                        PublishedAt = null,
                        TopicsCsv = string.Join(",", topics)
                    });
                }
            }
            catch (TaskCanceledException) { _logger.LogWarning("Cylaw {Url} timed out.", url); }
            catch (Exception ex) { _logger.LogError(ex, "Cylaw {Url} failed.", url); }
        }
        return results;
    }

    private static string StripHtml(string s)
    {
        if (string.IsNullOrEmpty(s)) return string.Empty;
        return Regex.Replace(s, "<.*?>", " ")
            .Replace("&nbsp;", " ")
            .Replace("&amp;", "&")
            .Trim();
    }
}
