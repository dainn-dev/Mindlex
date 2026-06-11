using System.Text.RegularExpressions;

namespace MyLaw.Services.Documents;

public sealed class RegexPiiSanitizer : IPiiSanitizer
{
    private readonly IConfiguration _config;
    private readonly ILogger<RegexPiiSanitizer> _logger;

    public RegexPiiSanitizer(IConfiguration config, ILogger<RegexPiiSanitizer> logger)
    {
        _config = config;
        _logger = logger;
    }

    public int LastMatchCount { get; private set; }

    public string Sanitize(string input)
    {
        LastMatchCount = 0;
        if (string.IsNullOrWhiteSpace(input)) return input;

        var placeholder = _config.GetValue<string>("MyLaw:Anonymization:Placeholder") ?? "[.............]";
        var patterns = _config.GetSection("MyLaw:Anonymization:PiiPatterns").GetChildren()
            .Select(c => c.Value)
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .ToList();

        var output = input;
        foreach (var pattern in patterns)
        {
            try
            {
                output = Regex.Replace(output, pattern!, m =>
                {
                    LastMatchCount++;
                    return placeholder;
                }, RegexOptions.IgnoreCase);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "PII pattern '{Pattern}' failed; skipping.", pattern);
            }
        }
        return output;
    }
}
