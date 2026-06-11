using System.Text.RegularExpressions;

namespace MyLaw.Services.Documents;

public sealed record RiskIssue(
    string Name,
    string RawText,
    string Explanation,
    string SuggestedRewrite);

public interface IRiskAnalyzer
{
    IReadOnlyList<RiskIssue> Analyze(string documentText);
}

public sealed class StubRiskAnalyzer : IRiskAnalyzer
{
    private static readonly Rule[] Rules =
    {
        new("Ambiguous Timeframe",
            new[] { @"\bas\s+soon\s+as\s+possible\b", @"\bin\s+a\s+reasonable\s+time\b", @"\bpromptly\b", @"\bwithout\s+undue\s+delay\b" },
            "Vague timeframes such as \"as soon as possible\" or \"reasonable time\" are difficult to enforce and may lead to disputes over expectations.",
            "The obligation shall be performed within [Number] calendar days of [Trigger Event]."),
        new("Vague \"Reasonable Effort\" Standard",
            new[] { @"\breasonable\s+effort(s)?\b", @"\bbest\s+effort(s)?\b" },
            "Subjective standards like \"reasonable effort\" or \"best effort\" leave room for interpretation and litigation.",
            "The party shall undertake the following specific steps: [Step 1], [Step 2], [Step 3] within [Timeframe]."),
        new("Overbroad Indemnity",
            new[] { @"any\s+and\s+all\s+losses", @"any\s+and\s+all\s+claims", @"any\s+and\s+all\s+damages" },
            "Indemnifying \"any and all\" losses or claims may be considered unreasonably broad and difficult to enforce.",
            "The indemnifying party shall be liable only for direct losses arising from material breach, excluding indirect, consequential, or punitive damages."),
        new("Uncapped Liability",
            new[] { @"shall\s+be\s+liable\s+for\s+all\s+damages", @"unlimited\s+liability" },
            "Uncapped liability exposes the party to disproportionate risk beyond commercial reasonableness.",
            "Liability under this Agreement shall not exceed [Cap Amount] or the total fees paid in the preceding [Number] months, whichever is greater."),
        new("Unilateral Termination",
            new[] { @"may\s+terminate\s+this\s+agreement\s+at\s+any\s+time\s+without\s+cause", @"sole\s+discretion\s+to\s+terminate" },
            "One-sided termination clauses can be challenged for unfairness, especially in B2B or employment contracts.",
            "Either party may terminate this Agreement by providing [Number] days' written notice, or immediately for material breach not cured within [Number] days of notice.")
    };

    public IReadOnlyList<RiskIssue> Analyze(string documentText)
    {
        if (string.IsNullOrWhiteSpace(documentText)) return Array.Empty<RiskIssue>();
        var issues = new List<RiskIssue>();

        foreach (var rule in Rules)
        {
            foreach (var pattern in rule.Patterns)
            {
                var match = Regex.Match(documentText, pattern, RegexOptions.IgnoreCase);
                if (!match.Success) continue;

                var snippet = ExtractSnippet(documentText, match.Index, match.Length);
                issues.Add(new RiskIssue(rule.Name, snippet, rule.Explanation, rule.SuggestedRewrite));
                break;
            }
        }
        return issues;
    }

    private static string ExtractSnippet(string text, int matchIndex, int matchLength)
    {
        const int contextChars = 60;
        var preStart = Math.Max(0, matchIndex - contextChars);
        var pre = text.Substring(preStart, matchIndex - preStart);
        var matched = text.Substring(matchIndex, matchLength);
        var postEnd = Math.Min(text.Length, matchIndex + matchLength + contextChars);
        var post = text.Substring(matchIndex + matchLength, postEnd - matchIndex - matchLength);
        return $"...{pre}<<{matched}>>{post}...".Replace("\r\n", " ").Replace("\n", " ");
    }

    private sealed record Rule(string Name, string[] Patterns, string Explanation, string SuggestedRewrite);
}
