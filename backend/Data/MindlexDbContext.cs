using Microsoft.EntityFrameworkCore;
using Pgvector;

namespace MyLaw.Data;

public sealed class ChatThread
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public string? Title { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public DateTime? LastMessageAt { get; set; }

    public ICollection<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
}

public sealed class ChatMessage
{
    public Guid Id { get; set; }
    public Guid ThreadId { get; set; }
    public string Role { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }

    public ChatThread? Thread { get; set; }
}

public sealed class NewsArticle
{
    public Guid Id { get; set; }
    public string Source { get; set; } = string.Empty;
    public string Headline { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public string SourceUrl { get; set; } = string.Empty;
    public DateTime? PublishedAt { get; set; }
    public DateTime IngestedAt { get; set; }
    public string TopicsCsv { get; set; } = string.Empty;
}

public sealed class NewsRead
{
    public Guid UserId { get; set; }
    public Guid ArticleId { get; set; }
    public DateTime ReadAt { get; set; }
}

public sealed class ChatUpload
{
    public Guid Id { get; set; }
    public Guid ThreadId { get; set; }
    public Guid OwnerId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public int WordCount { get; set; }
    public byte[] Content { get; set; } = Array.Empty<byte>();
    public DateTime CreatedAt { get; set; }

    public ChatThread? Thread { get; set; }
}

public sealed class DocumentShare
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public Guid SharedByUserId { get; set; }
    public string SharedByEmail { get; set; } = string.Empty;
    public string RecipientEmail { get; set; } = string.Empty;
    public string Token { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public DateTime? SeenAt { get; set; }

    public SavedDocument? Document { get; set; }
}

public sealed class SavedDocument
{
    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string DocumentType { get; set; } = string.Empty;
    public string ContentType { get; set; } = "application/octet-stream";
    public string Source { get; set; } = "ai_generated";
    public string TagsCsv { get; set; } = string.Empty;
    public string EditedBy { get; set; } = "System";
    public long SizeBytes { get; set; }
    public byte[] Content { get; set; } = Array.Empty<byte>();
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public Guid? SourceMessageId { get; set; }
    public Guid? SourceThreadId { get; set; }
}

public sealed class LegalDocument
{
    public long Id { get; set; }
    public string SourceUrl { get; set; } = string.Empty;
    public string? Title { get; set; }
    public string Content { get; set; } = string.Empty;
    public string? CaseNumber { get; set; }
    public string? Jurisdiction { get; set; }
    public string? Category { get; set; }
    public string? Parties { get; set; }
    public string? CaseDate { get; set; }
    public Vector? Embedding { get; set; }
    public DateTime? EmbeddedAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class MyLawDbContext : DbContext
{
    public MyLawDbContext(DbContextOptions<MyLawDbContext> options) : base(options) { }

    public DbSet<ChatThread> ChatThreads => Set<ChatThread>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<NewsArticle> NewsArticles => Set<NewsArticle>();
    public DbSet<NewsRead> NewsReads => Set<NewsRead>();
    public DbSet<SavedDocument> SavedDocuments => Set<SavedDocument>();
    public DbSet<DocumentShare> DocumentShares => Set<DocumentShare>();
    public DbSet<ChatUpload> ChatUploads => Set<ChatUpload>();
    public DbSet<LegalDocument> LegalDocuments => Set<LegalDocument>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasPostgresExtension("vector");

        b.Entity<LegalDocument>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).ValueGeneratedNever();
            e.Property(x => x.SourceUrl).IsRequired();
            e.Property(x => x.Content).IsRequired();
            e.Property(x => x.Embedding).HasColumnType("vector(384)");
            e.HasIndex(x => x.CaseNumber);
            e.HasIndex(x => x.Jurisdiction);
        });

        b.Entity<ChatThread>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.OwnerId);
            e.HasIndex(x => x.LastMessageAt);
            e.Property(x => x.Title).HasMaxLength(30);
        });

        b.Entity<ChatMessage>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.ThreadId);
            e.Property(x => x.Role).IsRequired().HasMaxLength(16);
            e.HasOne(x => x.Thread)
                .WithMany(t => t.Messages)
                .HasForeignKey(x => x.ThreadId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<NewsArticle>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.PublishedAt);
            e.HasIndex(x => x.IngestedAt);
            e.Property(x => x.Source).IsRequired().HasMaxLength(64);
            e.Property(x => x.Headline).IsRequired().HasMaxLength(500);
            e.Property(x => x.SourceUrl).IsRequired().HasMaxLength(1000);
            e.Property(x => x.TopicsCsv).HasMaxLength(500);
        });

        b.Entity<NewsRead>(e =>
        {
            e.HasKey(x => new { x.UserId, x.ArticleId });
            e.HasIndex(x => x.UserId);
        });

        b.Entity<SavedDocument>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.OwnerId);
            e.Property(x => x.FileName).IsRequired().HasMaxLength(255);
            e.Property(x => x.DocumentType).HasMaxLength(100);
            e.Property(x => x.ContentType).HasMaxLength(100);
            e.Property(x => x.Source).HasMaxLength(50);
            e.Property(x => x.TagsCsv).HasMaxLength(500);
            e.Property(x => x.EditedBy).HasMaxLength(255);
        });

        b.Entity<DocumentShare>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.RecipientEmail, x.ExpiresAt });
            e.HasIndex(x => x.Token).IsUnique();
            e.Property(x => x.RecipientEmail).IsRequired().HasMaxLength(255);
            e.Property(x => x.SharedByEmail).HasMaxLength(255);
            e.Property(x => x.Token).IsRequired().HasMaxLength(64);
            e.HasOne(x => x.Document)
                .WithMany()
                .HasForeignKey(x => x.DocumentId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        b.Entity<ChatUpload>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.ThreadId);
            e.Property(x => x.FileName).IsRequired().HasMaxLength(255);
            e.Property(x => x.ContentType).HasMaxLength(100);
            e.HasOne(x => x.Thread)
                .WithMany()
                .HasForeignKey(x => x.ThreadId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
