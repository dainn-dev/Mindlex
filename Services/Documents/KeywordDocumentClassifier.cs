using System.Text;

namespace Mindlex.Services.Documents;

public sealed class KeywordDocumentClassifier : IDocumentClassifier
{
    private readonly IConfiguration _config;
    private readonly ILogger<KeywordDocumentClassifier> _logger;

    public KeywordDocumentClassifier(IConfiguration config, ILogger<KeywordDocumentClassifier> logger)
    {
        _config = config;
        _logger = logger;
    }

    public Task<string?> ClassifyAsync(string fileName, byte[] contentBytes, CancellationToken ct)
    {
        try
        {
            var map = _config.GetSection("Mindlex:ContentManagement:ClassificationKeywords")
                .GetChildren()
                .ToDictionary(s => s.Key, s => s.Get<string[]>() ?? Array.Empty<string>(),
                              StringComparer.OrdinalIgnoreCase);
            if (map.Count == 0) return Task.FromResult<string?>(null);

            var sample = SafeTextSample(contentBytes, 16 * 1024);
            var haystack = (fileName + " " + sample).ToLowerInvariant();

            var scored = map
                .Select(kv => new
                {
                    Topic = kv.Key,
                    Score = kv.Value.Count(k => haystack.Contains(k.ToLowerInvariant()))
                })
                .Where(x => x.Score > 0)
                .OrderByDescending(x => x.Score)
                .ToList();

            return Task.FromResult<string?>(scored.FirstOrDefault()?.Topic);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Keyword classifier failed for {FileName}; saving without tag.", fileName);
            return Task.FromResult<string?>(null);
        }
    }

    private static string SafeTextSample(byte[] bytes, int max)
    {
        var slice = bytes.AsSpan(0, Math.Min(max, bytes.Length));
        // Strip control characters except whitespace
        var sb = new StringBuilder();
        foreach (var b in slice)
        {
            if (b == '\r' || b == '\n' || b == '\t' || (b >= 0x20 && b < 0x7F))
                sb.Append((char)b);
        }
        return sb.ToString();
    }
}
