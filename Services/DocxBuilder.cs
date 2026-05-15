using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;

namespace Mindlex.Services;

public static class DocxBuilder
{
    public static byte[] BuildFromText(string title, IEnumerable<(string Heading, string Body)> sections)
    {
        using var ms = new MemoryStream();
        using (var doc = WordprocessingDocument.Create(ms, WordprocessingDocumentType.Document))
        {
            var mainPart = doc.AddMainDocumentPart();
            mainPart.Document = new Document();
            var body = mainPart.Document.AppendChild(new Body());

            if (!string.IsNullOrWhiteSpace(title))
            {
                body.AppendChild(MakeHeading(title));
            }

            foreach (var (heading, content) in sections)
            {
                if (!string.IsNullOrWhiteSpace(heading))
                {
                    body.AppendChild(MakeHeading(heading));
                }
                foreach (var line in content.Replace("\r\n", "\n").Split('\n'))
                {
                    body.AppendChild(MakeParagraph(line));
                }
            }

            mainPart.Document.Save();
        }
        return ms.ToArray();
    }

    private static Paragraph MakeHeading(string text)
    {
        var p = new Paragraph();
        var pp = new ParagraphProperties(new ParagraphStyleId { Val = "Heading2" });
        p.AppendChild(pp);
        var run = new Run(new Text(text) { Space = SpaceProcessingModeValues.Preserve });
        run.RunProperties = new RunProperties(new Bold());
        p.AppendChild(run);
        return p;
    }

    private static Paragraph MakeParagraph(string text)
    {
        var p = new Paragraph();
        var run = new Run(new Text(text) { Space = SpaceProcessingModeValues.Preserve });
        p.AppendChild(run);
        return p;
    }
}
