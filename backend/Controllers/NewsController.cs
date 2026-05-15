using System.Security.Claims;
using System.Text.Json;
using DainnUser.Core.Enums;
using DainnUser.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Mindlex.Data;
using Mindlex.Models;
using Mindlex.Services;

namespace Mindlex.Controllers;

[ApiController]
[Authorize]
[Route("api/news")]
public class NewsController : ControllerBase
{
    public const string TopicsMarker = "news_topics_selected";

    private static readonly string[] DefaultFeedTopics =
        { "Banking & Finance", "Commercial", "Competition", "Corporate", "Employment" };

    private readonly IRoleService _roles;
    private readonly IActivityService _activity;
    private readonly MindlexDbContext _db;
    private readonly IConfiguration _config;

    public NewsController(
        IRoleService roles,
        IActivityService activity,
        MindlexDbContext db,
        IConfiguration config)
    {
        _roles = roles;
        _activity = activity;
        _db = db;
        _config = config;
    }

    private Guid? CurrentUserId
    {
        get
        {
            var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
            return Guid.TryParse(sub, out var id) ? id : null;
        }
    }

    [HttpGet("topics")]
    public async Task<IActionResult> GetTopics(CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var available = _config.GetSection("Mindlex:LegalNews:Topics").Get<string[]>() ?? Array.Empty<string>();
        var roleNames = (await _roles.GetUserRolesAsync(userId.Value, ct)).Select(r => r.Name).ToList();
        var canEdit = roleNames.Any(r => string.Equals(r, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase)
                                       || string.Equals(r, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase));

        var selected = await LoadSelectedTopicsAsync(userId.Value, ct);

        return Ok(new
        {
            availableTopics = available,
            selectedTopics = selected,
            canEdit
        });
    }

    [HttpPut("topics")]
    public async Task<IActionResult> SaveTopics([FromBody] SaveTopicsRequest req, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var roleNames = (await _roles.GetUserRolesAsync(userId.Value, ct)).Select(r => r.Name).ToList();
        var allowed = roleNames.Any(r => string.Equals(r, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase)
                                        || string.Equals(r, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase));
        if (!allowed)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Topic selection is available on the Premium plan only.",
                code = "topic_selection_not_allowed"
            });
        }

        var available = (_config.GetSection("Mindlex:LegalNews:Topics").Get<string[]>() ?? Array.Empty<string>())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var invalid = req.Topics
            .Where(t => !available.Contains(t))
            .ToList();
        if (invalid.Count > 0)
        {
            return BadRequest(new
            {
                error = $"Invalid topics: {string.Join(", ", invalid)}. Choose from the predefined list.",
                code = "invalid_topics"
            });
        }

        var normalized = req.Topics.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var metadata = JsonSerializer.Serialize(new
        {
            action = TopicsMarker,
            topics = normalized,
            savedAt = DateTime.UtcNow
        });

        await _activity.LogActivityAsync(
            userId.Value,
            ActivityType.ProfileUpdate,
            $"Saved {normalized.Count} legal news topic(s).",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString() ?? string.Empty,
            userAgent: Request.Headers.UserAgent.ToString() ?? string.Empty,
            metadata,
            ct);

        return Ok(new { selectedTopics = normalized });
    }

    [HttpGet("feed")]
    public async Task<IActionResult> GetFeed(CancellationToken ct = default)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var maxArticles = _config.GetValue<int?>("Mindlex:LegalNews:MaxArticlesInFeed") ?? 50;

        var saved = await LoadSelectedTopicsAsync(userId.Value, ct);
        var topics = saved.Count > 0 ? saved : DefaultFeedTopics.ToList();
        var usingDefault = saved.Count == 0;

        var query = _db.NewsArticles.AsNoTracking().AsQueryable();
        if (topics.Count > 0)
        {
            var topicsLower = topics.Select(t => t.ToLowerInvariant()).ToList();
            query = query.Where(a => topicsLower.Any(t => a.TopicsCsv.ToLower().Contains(t)));
        }

        var items = await query
            .OrderByDescending(a => a.PublishedAt ?? a.IngestedAt)
            .Take(maxArticles)
            .ToListAsync(ct);

        var totalCount = items.Count;

        var ids = items.Select(a => a.Id).ToList();
        var readIds = await _db.NewsReads
            .Where(r => r.UserId == userId.Value && ids.Contains(r.ArticleId))
            .Select(r => r.ArticleId)
            .ToListAsync(ct);
        var readSet = readIds.ToHashSet();

        return Ok(new
        {
            totalCount,
            appliedTopics = topics,
            usingDefaultTopics = usingDefault,
            items = items.Select(a => new
            {
                id = a.Id,
                source = a.Source,
                headline = a.Headline,
                summary = a.Summary,
                topics = a.TopicsCsv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
                publishedAt = a.PublishedAt,
                sourceUrl = a.SourceUrl,
                isUnread = !readSet.Contains(a.Id)
            })
        });
    }

    [HttpPost("articles/{articleId:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid articleId, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var exists = await _db.NewsArticles.AnyAsync(a => a.Id == articleId, ct);
        if (!exists) return NotFound(new { error = "Article not found." });

        var already = await _db.NewsReads
            .AnyAsync(r => r.UserId == userId.Value && r.ArticleId == articleId, ct);
        if (already) return Ok(new { articleId, alreadyRead = true });

        _db.NewsReads.Add(new NewsRead
        {
            UserId = userId.Value,
            ArticleId = articleId,
            ReadAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync(ct);

        return Ok(new { articleId, alreadyRead = false });
    }

    [HttpGet("unread-count")]
    public async Task<IActionResult> GetUnreadCount(CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var maxArticles = _config.GetValue<int?>("Mindlex:LegalNews:MaxArticlesInFeed") ?? 50;

        var saved = await LoadSelectedTopicsAsync(userId.Value, ct);
        var topics = saved.Count > 0 ? saved : DefaultFeedTopics.ToList();

        var query = _db.NewsArticles.AsNoTracking().AsQueryable();
        if (topics.Count > 0)
        {
            var topicsLower = topics.Select(t => t.ToLowerInvariant()).ToList();
            query = query.Where(a => topicsLower.Any(t => a.TopicsCsv.ToLower().Contains(t)));
        }

        var feedIds = await query
            .OrderByDescending(a => a.PublishedAt ?? a.IngestedAt)
            .Take(maxArticles)
            .Select(a => a.Id)
            .ToListAsync(ct);

        var readIds = await _db.NewsReads
            .Where(r => r.UserId == userId.Value && feedIds.Contains(r.ArticleId))
            .Select(r => r.ArticleId)
            .ToListAsync(ct);

        var unread = feedIds.Count - readIds.Count;
        return Ok(new
        {
            unreadCount = unread,
            hasUnread = unread > 0
        });
    }

    private async Task<List<string>> LoadSelectedTopicsAsync(Guid userId, CancellationToken ct)
    {
        var (activities, _) = await _activity.GetActivityLogAsync(
            userId, pageNumber: 1, pageSize: 100,
            activityType: ActivityType.ProfileUpdate,
            startDate: null, endDate: null, ct);

        var latest = activities
            .Where(a => a.Metadata?.Contains(TopicsMarker, StringComparison.OrdinalIgnoreCase) ?? false)
            .OrderByDescending(a => a.CreatedAt)
            .FirstOrDefault();

        if (latest?.Metadata is null) return new();
        try
        {
            using var doc = JsonDocument.Parse(latest.Metadata);
            if (doc.RootElement.TryGetProperty("topics", out var arr) && arr.ValueKind == JsonValueKind.Array)
            {
                return arr.EnumerateArray()
                    .Select(e => e.GetString() ?? string.Empty)
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .ToList();
            }
        }
        catch { /* fall through */ }
        return new();
    }
}
