using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using MyLaw.Data;
using Pgvector;
using Pgvector.EntityFrameworkCore;

namespace MyLaw.Services;

public interface ILegalSearchService
{
    Task<List<LegalDocumentResult>> SearchAsync(string query, int topK = 5, CancellationToken ct = default);
}

public record LegalDocumentResult(
    long Id,
    string Title,
    string Content,
    string? CaseNumber,
    string? Jurisdiction,
    string SourceUrl);

public class LegalSearchService : ILegalSearchService
{
    private readonly MyLawDbContext _db;
    private readonly IHttpClientFactory _httpFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<LegalSearchService> _logger;

    public LegalSearchService(
        MyLawDbContext db,
        IHttpClientFactory httpFactory,
        IConfiguration config,
        ILogger<LegalSearchService> logger)
    {
        _db = db;
        _httpFactory = httpFactory;
        _config = config;
        _logger = logger;
    }

    public async Task<List<LegalDocumentResult>> SearchAsync(string query, int topK = 5, CancellationToken ct = default)
    {
        var baseUrl = _config["EmbeddingService:BaseUrl"] ?? "http://localhost:8001";
        var http = _httpFactory.CreateClient();

        float[] embedding;
        try
        {
            var resp = await http.PostAsJsonAsync($"{baseUrl}/embed", new { text = query }, ct);
            resp.EnsureSuccessStatusCode();
            var body = await resp.Content.ReadFromJsonAsync<EmbedResponse>(cancellationToken: ct);
            embedding = body?.Embedding ?? throw new InvalidOperationException("Null embedding response");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Embedding service unavailable — skipping RAG retrieval");
            return [];
        }

        var vector = new Vector(embedding);

        var docs = await _db.LegalDocuments
            .Where(d => d.Embedding != null)
            .OrderBy(d => d.Embedding!.CosineDistance(vector))
            .Take(topK)
            .ToListAsync(ct);

        return docs.Select(d => new LegalDocumentResult(
            d.Id,
            d.Title ?? d.CaseNumber ?? d.SourceUrl,
            d.Content.Length > 600 ? d.Content[..600] + "…" : d.Content,
            d.CaseNumber,
            d.Jurisdiction,
            d.SourceUrl
        )).ToList();
    }

    private sealed record EmbedResponse(float[] Embedding);
}
