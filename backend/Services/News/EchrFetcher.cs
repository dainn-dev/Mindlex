using System.Globalization;
using System.Text.Json;
using MyLaw.Data;

namespace MyLaw.Services.News;

/// <summary>
/// ECHR fetcher: hits the public HUDOC search endpoint.
///   GET https://hudoc.echr.coe.int/app/query/results?query=...&amp;select=...
/// Returns JSON wrapping `results[].columns` keyed by HUDOC field codes
/// (itemid, kpdate, languageisocode, doctype, docname, ...).
/// Feed URLs and field selectors are configured under
///   MyLaw:LegalNews:FeedUrls:ECHR (string[]).
/// </summary>
public sealed class EchrFetcher : INewsSourceFetcher
{
    public string SourceName => "ECHR";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<EchrFetcher> _logger;

    public EchrFetcher(IHttpClientFactory httpClientFactory, IConfiguration config, ILogger<EchrFetcher> logger)
    {
        _httpClientFactory = httpClientFactory;
        _config = config;
        _logger = logger;
    }

    public async Task<IReadOnlyList<NewsArticle>> FetchAsync(DateTime sinceUtc, CancellationToken ct)
    {
        var urls = _config
            .GetSection("MyLaw:LegalNews:FeedUrls:ECHR")
            .Get<string[]>() ?? Array.Empty<string>();
        if (urls.Length == 0)
        {
            _logger.LogInformation("ECHR fetcher: no HUDOC URLs configured.");
            return Array.Empty<NewsArticle>();
        }

        var client = _httpClientFactory.CreateClient("news");
        client.Timeout = TimeSpan.FromSeconds(45);
        client.DefaultRequestHeaders.UserAgent.Clear();
        client.DefaultRequestHeaders.UserAgent.ParseAdd("MyLawNewsBot/1.0 (+https://mylaw.ai)");

        var keywordsSection = _config.GetSection("MyLaw:ContentManagement:ClassificationKeywords").GetChildren();
        var topicKeywords = keywordsSection.ToDictionary(
            s => s.Key,
            s => s.Get<string[]>() ?? Array.Empty<string>(),
            StringComparer.OrdinalIgnoreCase);

        var results = new List<NewsArticle>();
        foreach (var url in urls)
        {
            try
            {
                using var resp = await client.GetAsync(url, ct);
                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("HUDOC {Url} returned {Status}.", url, (int)resp.StatusCode);
                    continue;
                }
                var body = await resp.Content.ReadAsStringAsync(ct);
                using var doc = JsonDocument.Parse(body);
                if (!doc.RootElement.TryGetProperty("results", out var items) || items.ValueKind != JsonValueKind.Array)
                {
                    _logger.LogWarning("HUDOC {Url}: response has no `results` array.", url);
                    continue;
                }

                foreach (var item in items.EnumerateArray())
                {
                    if (!item.TryGetProperty("columns", out var cols)) continue;
                    var itemId = GetStr(cols, "itemid");
                    var name = GetStr(cols, "docname") ?? GetStr(cols, "appno");
                    var date = ParseDate(GetStr(cols, "kpdate") ?? GetStr(cols, "judgementdate"));
                    var doctype = GetStr(cols, "doctype") ?? "case";
                    if (string.IsNullOrWhiteSpace(itemId) || string.IsNullOrWhiteSpace(name)) continue;
                    if (date.HasValue && date.Value < sinceUtc) continue;

                    var permalink = $"https://hudoc.echr.coe.int/eng?i={Uri.EscapeDataString(itemId!)}";
                    var summary = $"{doctype} - {name}";
                    var topics = topicKeywords
                        .Where(kv => kv.Value.Any(w => summary.Contains(w, StringComparison.OrdinalIgnoreCase)
                                                   || (name ?? "").Contains(w, StringComparison.OrdinalIgnoreCase)))
                        .Select(kv => kv.Key)
                        .ToList();

                    var headline = (name ?? "ECHR case");
                    if (headline.Length > 500) headline = headline[..500];

                    results.Add(new NewsArticle
                    {
                        Id = Guid.NewGuid(),
                        Source = SourceName,
                        Headline = headline,
                        Summary = summary.Length > 1000 ? summary[..1000] : summary,
                        SourceUrl = permalink,
                        PublishedAt = date,
                        TopicsCsv = string.Join(",", topics)
                    });
                }
            }
            catch (TaskCanceledException) { _logger.LogWarning("HUDOC {Url} timed out.", url); }
            catch (Exception ex) { _logger.LogError(ex, "HUDOC {Url} failed.", url); }
        }
        return results;
    }

    private static string? GetStr(JsonElement obj, string name)
    {
        if (!obj.TryGetProperty(name, out var v)) return null;
        return v.ValueKind == JsonValueKind.String ? v.GetString() : v.ToString();
    }

    private static DateTime? ParseDate(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (DateTime.TryParse(raw, CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var dt))
            return dt.ToUniversalTime();
        return null;
    }
}
