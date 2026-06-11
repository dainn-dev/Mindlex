namespace MyLaw.Services.Documents;

public interface IDocumentClassifier
{
    Task<string?> ClassifyAsync(string fileName, byte[] contentBytes, CancellationToken ct);
}
