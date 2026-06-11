using System.Text;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace MyLaw.Services.Documents;

public sealed class UploadAnonymizerResult
{
    public byte[] Bytes { get; init; } = Array.Empty<byte>();
    public int MatchCount { get; init; }
    public bool Modified { get; init; }
}

public interface IUploadAnonymizer
{
    UploadAnonymizerResult Anonymize(byte[] input, string extension);
    bool Supports(string extension);
}

public sealed class UploadAnonymizer : IUploadAnonymizer
{
    private readonly IPiiSanitizer _sanitizer;
    private readonly ILogger<UploadAnonymizer> _logger;

    public UploadAnonymizer(IPiiSanitizer sanitizer, ILogger<UploadAnonymizer> logger)
    {
        _sanitizer = sanitizer;
        _logger = logger;
    }

    public bool Supports(string extension)
    {
        return string.Equals(extension, ".docx", StringComparison.OrdinalIgnoreCase)
            || string.Equals(extension, ".txt", StringComparison.OrdinalIgnoreCase);
    }

    public UploadAnonymizerResult Anonymize(byte[] input, string extension)
    {
        if (string.Equals(extension, ".txt", StringComparison.OrdinalIgnoreCase))
            return AnonymizeText(input);

        if (string.Equals(extension, ".docx", StringComparison.OrdinalIgnoreCase))
            return AnonymizeDocx(input);

        return new UploadAnonymizerResult { Bytes = input, MatchCount = 0, Modified = false };
    }

    private UploadAnonymizerResult AnonymizeText(byte[] input)
    {
        var text = Encoding.UTF8.GetString(input);
        var sanitized = _sanitizer.Sanitize(text);
        var matches = _sanitizer.LastMatchCount;
        if (matches == 0)
        {
            return new UploadAnonymizerResult { Bytes = input, MatchCount = 0, Modified = false };
        }
        return new UploadAnonymizerResult
        {
            Bytes = Encoding.UTF8.GetBytes(sanitized),
            MatchCount = matches,
            Modified = true
        };
    }

    private UploadAnonymizerResult AnonymizeDocx(byte[] input)
    {
        try
        {
            using var ms = new MemoryStream();
            ms.Write(input, 0, input.Length);
            ms.Position = 0;

            var totalMatches = 0;
            using (var doc = WordprocessingDocument.Open(ms, isEditable: true))
            {
                var body = doc.MainDocumentPart?.Document?.Body;
                if (body is null)
                    return new UploadAnonymizerResult { Bytes = input, MatchCount = 0, Modified = false };

                foreach (var text in body.Descendants<Text>())
                {
                    var sanitized = _sanitizer.Sanitize(text.Text ?? string.Empty);
                    var matches = _sanitizer.LastMatchCount;
                    if (matches > 0)
                    {
                        text.Text = sanitized;
                        totalMatches += matches;
                    }
                }

                if (totalMatches > 0)
                {
                    doc.MainDocumentPart!.Document.Save();
                }
            }

            if (totalMatches == 0)
                return new UploadAnonymizerResult { Bytes = input, MatchCount = 0, Modified = false };

            return new UploadAnonymizerResult
            {
                Bytes = ms.ToArray(),
                MatchCount = totalMatches,
                Modified = true
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "DOCX anonymization failed; storing original.");
            return new UploadAnonymizerResult { Bytes = input, MatchCount = 0, Modified = false };
        }
    }
}
