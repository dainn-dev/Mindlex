using System.Text.RegularExpressions;
using MyLaw.Data;

namespace MyLaw.Services.News;

/// <summary>
/// BAILII (British and Irish Legal Information Institute) news fetcher.
///
/// BAILII publishes Atom feeds per-court at /cgi-bin/atom.cgi?path=...
/// Example feeds configured under MyLaw:LegalNews:FeedUrls:Bailii:
///   - https://www.bailii.org/cgi-bin/atom.cgi?path=ew/cases/UKSC
///   - https://www.bailii.org/cgi-bin/atom.cgi?path=ew/cases/EWCA
///
/// On top of the generic RSS/Atom parsing in RssFetcherBase, BAILII items
/// have a canonical citation prefix in their title we strip out, and we
/// bias topic classification toward "EU Law" / "Competition" / "Employment"
/// because BAILII is primarily English-court material.
/// </summary>
public sealed class BailiiFetcher : RssFetcherBase
{
    public override string SourceName => "Bailii";
    protected override string FeedKey => "Bailii";

    // Matches things like "Smith v Jones [2024] UKSC 12 (15 March 2024)"
    // → strip the citation suffix so the headline is cleaner.
    private static readonly Regex CitationSuffix = new(
        @"\s*\[\d{4}\]\s+[A-Z]{2,}[A-Za-z0-9 ]*\s*\([^)]*\)\s*$",
        RegexOptions.Compiled);

    // URL path court codes → human readable for source biasing.
    private static readonly Dictionary<string, string> CourtNames =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["UKSC"]   = "UK Supreme Court",
            ["UKPC"]   = "UK Privy Council",
            ["EWCA"]   = "England & Wales Court of Appeal",
            ["EWHC"]   = "England & Wales High Court",
            ["UKEAT"]  = "Employment Appeal Tribunal",
            ["UKUT"]   = "Upper Tribunal",
            ["UKFTT"]  = "First-tier Tribunal",
            ["IESC"]   = "Supreme Court of Ireland",
            ["NICA"]   = "Northern Ireland Court of Appeal"
        };

    public BailiiFetcher(IHttpClientFactory httpClientFactory, IConfiguration config, ILogger<BailiiFetcher> logger)
        : base(httpClientFactory, config, logger) { }

    /// <summary>
    /// Adds a "court" topic prefix derived from the source URL path
    /// (e.g. .../UKSC/... → "UK Supreme Court") on top of keyword-based topics.
    /// </summary>
    protected override IEnumerable<string> ClassifyTopics(string title, string summary)
    {
        // Generic keyword classification first.
        foreach (var t in base.ClassifyTopics(title, summary))
            yield return t;

        // Court derivation: look for the BAILII court code anywhere in headline.
        foreach (var pair in CourtNames)
        {
            if (Regex.IsMatch(title + " " + summary, $"\\b{Regex.Escape(pair.Key)}\\b"))
            {
                yield return pair.Value;
            }
        }
    }

    /// <summary>
    /// Override BuildArticle to strip the trailing "[2024] UKSC 12 (date)" citation
    /// suffix from the headline. RssFetcherBase.BuildArticle handles trimming &amp; topics.
    /// </summary>
    protected override NewsArticle BuildArticle(string title, string summary, string url, DateTime? publishedAt)
    {
        var cleaned = CitationSuffix.Replace(title, string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(cleaned)) cleaned = title;
        return base.BuildArticle(cleaned, summary, url, publishedAt);
    }
}
