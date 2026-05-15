using System.Text;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace Mindlex.Services.Documents;

public static class DocxTextExtractor
{
    public static int CountWords(byte[] bytes, string extension)
    {
        var text = ExtractText(bytes, extension);
        if (string.IsNullOrWhiteSpace(text)) return 0;
        return text.Split(new[] { ' ', '\t', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries).Length;
    }

    public static string ExtractText(byte[] bytes, string extension)
    {
        if (string.Equals(extension, ".docx", StringComparison.OrdinalIgnoreCase))
            return ExtractDocx(bytes);

        // .doc (Word 97-2003 binary): best-effort ASCII pass — inexact but usable for word count cap
        return ExtractBinaryBestEffort(bytes);
    }

    private static string ExtractDocx(byte[] bytes)
    {
        try
        {
            using var ms = new MemoryStream(bytes);
            using var doc = WordprocessingDocument.Open(ms, isEditable: false);
            var body = doc.MainDocumentPart?.Document?.Body;
            if (body is null) return string.Empty;

            var sb = new StringBuilder();
            foreach (var t in body.Descendants<Text>())
            {
                sb.Append(t.Text);
                sb.Append(' ');
            }
            return sb.ToString();
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string ExtractBinaryBestEffort(byte[] bytes)
    {
        var sb = new StringBuilder();
        foreach (var b in bytes)
        {
            if (b == '\r' || b == '\n' || b == '\t' || (b >= 0x20 && b < 0x7F))
                sb.Append((char)b);
        }
        return sb.ToString();
    }
}
