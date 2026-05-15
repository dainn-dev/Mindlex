namespace Mindlex.Services.Documents;

public interface IPiiSanitizer
{
    string Sanitize(string input);
    int LastMatchCount { get; }
}
