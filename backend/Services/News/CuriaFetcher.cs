using System.Text.RegularExpressions;
using Mindlex.Data;

namespace Mindlex.Services.News;

/// <summary>
/// Curia / Court of Justice of the European Union (CJEU) news fetcher.
///
/// Curia publishes RSS for jurisprudence / press releases. Configure URLs
/// under Mindlex:LegalNews:FeedUrls:Curia. Example:
///   - https://curia.europa.eu/cms/jcms/op/upload/docs/application/xml/jurisprudence-rss-en.xml
///
/// On top of the generic RSS/Atom parsing in RssFetcherBase:
///  - Every article is tagged "EU Law" (Curia is by definition EU jurisprudence).
///  - We detect "C-XXX/YY" case numbers and add them as a synthetic topic so
///    Premium users searching by case ref can find them.
///  - Source URLs are normalized: Curia URLs sometimes carry a session
///    parameter (;jsessionid=...) we strip for stable dedup.
/// </summary>
public sealed class CuriaFetcher : RssFetcherBase
{
    public override string SourceName => "Curia";
    protected override string FeedKey => "Curia";

    private static readonly Regex CaseNumberRegex = new(
        @"\bC-\d{1,4}\/\d{2}\b",
        RegexOptions.Compiled);

    private static readonly Regex SessionIdRegex = new(
        @";jsessionid=[^?&]+",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public CuriaFetcher(IHttpClientFactory httpClientFactory, IConfiguration config, ILogger<CuriaFetcher> logger)
        : base(httpClientFactory, config, logger) { }

    /// <summary>
    /// Every Curia article belongs to "EU Law"; we additionally surface any
    /// "C-XXX/YY" case number as a pseudo-topic so it shows in chip lists.
    /// </summary>
    protected override IEnumerable<string> ClassifyTopics(string title, string summary)
    {
        // EU Law unconditionally.
        yield return "EU Law";

        foreach (var t in base.ClassifyTopics(title, summary))
        {
            if (!string.Equals(t, "EU Law", StringComparison.OrdinalIgnoreCase))
                yield return t;
        }

        var blob = title + " " + summary;
        foreach (Match m in CaseNumberRegex.Matches(blob))
        {
            yield return m.Value; // e.g. "C-123/24"
        }
    }

    /// <summary>
    /// Strip session ids out of Curia URLs so the same case fetched on
    /// different days dedups correctly.
    /// </summary>
    protected override NewsArticle BuildArticle(string title, string summary, string url, DateTime? publishedAt)
    {
        var normalized = SessionIdRegex.Replace(url, string.Empty);
        return base.BuildArticle(title, summary, normalized, publishedAt);
    }
}
