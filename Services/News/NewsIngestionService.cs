using Microsoft.EntityFrameworkCore;
using Mindlex.Data;

namespace Mindlex.Services.News;

public sealed class NewsIngestionService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly IConfiguration _config;
    private readonly ILogger<NewsIngestionService> _logger;

    public NewsIngestionService(
        IServiceProvider services,
        IConfiguration config,
        ILogger<NewsIngestionService> logger)
    {
        _services = services;
        _config = config;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var nextRun = ComputeNextRun(DateTime.UtcNow);
            var wait = nextRun - DateTime.UtcNow;
            _logger.LogInformation("Next news ingest at {NextRun} UTC ({Wait} from now).", nextRun, wait);

            try { await Task.Delay(wait, stoppingToken); }
            catch (TaskCanceledException) { break; }

            try { await RunIngestAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "News ingest run failed."); }
        }
    }

    private DateTime ComputeNextRun(DateTime now)
    {
        var hour = _config.GetValue<int?>("Mindlex:LegalNews:DailyRunHourUtc") ?? 4;
        var todaysRun = new DateTime(now.Year, now.Month, now.Day, hour, 0, 0, DateTimeKind.Utc);
        return now < todaysRun ? todaysRun : todaysRun.AddDays(1);
    }

    private async Task RunIngestAsync(CancellationToken ct)
    {
        var lookbackDays = _config.GetValue<int?>("Mindlex:LegalNews:LookbackDays") ?? 30;
        var sinceUtc = DateTime.UtcNow.AddDays(-lookbackDays);

        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MindlexDbContext>();
        var fetchers = scope.ServiceProvider.GetServices<INewsSourceFetcher>().ToList();

        var existingUrls = await db.NewsArticles
            .Where(a => a.IngestedAt > sinceUtc.AddDays(-lookbackDays))
            .Select(a => a.SourceUrl)
            .ToListAsync(ct);
        var seen = existingUrls.ToHashSet(StringComparer.OrdinalIgnoreCase);

        var totalAdded = 0;
        foreach (var fetcher in fetchers)
        {
            try
            {
                var fetched = await fetcher.FetchAsync(sinceUtc, ct);
                var fresh = fetched
                    .Where(a => !string.IsNullOrWhiteSpace(a.SourceUrl) && !seen.Contains(a.SourceUrl))
                    .ToList();
                foreach (var article in fresh)
                {
                    article.Id = article.Id == Guid.Empty ? Guid.NewGuid() : article.Id;
                    article.IngestedAt = DateTime.UtcNow;
                    db.NewsArticles.Add(article);
                    seen.Add(article.SourceUrl);
                }
                totalAdded += fresh.Count;
                _logger.LogInformation("Source {Source}: fetched {Fetched}, new {New}.",
                    fetcher.SourceName, fetched.Count, fresh.Count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Fetcher {Source} failed.", fetcher.SourceName);
            }
        }

        if (totalAdded > 0)
        {
            await db.SaveChangesAsync(ct);
            _logger.LogInformation("News ingest persisted {Count} new articles.", totalAdded);
        }
    }
}
