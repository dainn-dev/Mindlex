namespace MyLaw.Services.Documents;

public sealed record ComplianceIssue(
    string Name,
    string RawText,
    string Explanation,
    string SuggestedClause);

public interface IComplianceChecker
{
    IReadOnlyList<ComplianceIssue> Check(string documentText);
}

public sealed class StubComplianceChecker : IComplianceChecker
{
    private static readonly Rule[] Rules =
    {
        new("Missing Dispute Resolution Clause",
            new[] { "dispute resolution", "arbitration", "shall be resolved", "settle any dispute" },
            "Recommended to prevent costly litigation and clarify how disputes will be resolved.",
            "Any dispute arising out of or in connection with this Agreement shall be finally settled by arbitration in accordance with the rules of the ICC."),
        new("Missing Confidentiality Clause",
            new[] { "confidential", "non-disclosure", "nda" },
            "Confidentiality clauses are standard to protect sensitive or proprietary information in most agreements.",
            "Each party agrees to keep all non-public information disclosed during the course of this Agreement confidential and shall not disclose it to third parties without prior written consent."),
        new("Missing Governing Law Clause",
            new[] { "governing law", "governed by the laws", "jurisdiction" },
            "Specifies which legal system applies to interpret and enforce the agreement.",
            "This Agreement shall be governed by and construed in accordance with the laws of [Jurisdiction]."),
        new("Missing Termination Clause",
            new[] { "termination", "terminate this agreement", "may terminate" },
            "Defines how parties may end the agreement and obligations on termination.",
            "Either party may terminate this Agreement upon [Number] days' prior written notice to the other party."),
        new("Missing Limitation of Liability Clause",
            new[] { "limitation of liability", "liability of", "shall not be liable" },
            "Caps each party's exposure to damages and clarifies excluded damage types.",
            "The Service Provider shall be liable only for direct damages resulting from willful misconduct or gross negligence, up to the amount of fees paid in the last 12 months.")
    };

    public IReadOnlyList<ComplianceIssue> Check(string documentText)
    {
        if (string.IsNullOrWhiteSpace(documentText)) return Array.Empty<ComplianceIssue>();
        var haystack = documentText.ToLowerInvariant();
        var issues = new List<ComplianceIssue>();

        foreach (var rule in Rules)
        {
            var present = rule.Keywords.Any(k => haystack.Contains(k));
            if (!present)
            {
                var snippet = ExtractSnippetAroundEnd(documentText, rule.Name);
                issues.Add(new ComplianceIssue(
                    rule.Name,
                    snippet,
                    rule.Explanation,
                    rule.SuggestedClause));
            }
        }
        return issues;
    }

    private static string ExtractSnippetAroundEnd(string text, string issueName)
    {
        var trimmed = text.Trim();
        if (trimmed.Length == 0) return $"[NO {issueName.ToUpperInvariant()} FOUND IN DOCUMENT]";
        var tail = trimmed.Length <= 200 ? trimmed : trimmed.Substring(trimmed.Length - 200);
        return $"...{tail} [NO {issueName.ToUpperInvariant()} FOUND]";
    }

    private sealed record Rule(string Name, string[] Keywords, string Explanation, string SuggestedClause);
}
