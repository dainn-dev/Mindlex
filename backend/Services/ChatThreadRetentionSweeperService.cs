using DainnUser.Core.Interfaces.Services;
using DainnUser.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using MyLaw.Data;

namespace MyLaw.Services;

public sealed class ChatThreadRetentionSweeperService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly IConfiguration _config;
    private readonly ILogger<ChatThreadRetentionSweeperService> _logger;

    public ChatThreadRetentionSweeperService(
        IServiceProvider services,
        IConfiguration config,
        ILogger<ChatThreadRetentionSweeperService> logger)
    {
        _services = services;
        _config = config;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var intervalMinutes = _config.GetValue<int?>("MyLaw:Chatbot:RetentionSweepIntervalMinutes") ?? 30;
        var interval = TimeSpan.FromMinutes(intervalMinutes);

        while (!stoppingToken.IsCancellationRequested)
        {
            try { await RunSweepAsync(stoppingToken); }
            catch (Exception ex) { _logger.LogError(ex, "Chat retention sweep failed."); }

            try { await Task.Delay(interval, stoppingToken); }
            catch (TaskCanceledException) { break; }
        }
    }

    private async Task RunSweepAsync(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        using var scope = _services.CreateScope();
        var mylawDb = scope.ServiceProvider.GetRequiredService<MyLawDbContext>();
        var userDb = scope.ServiceProvider.GetRequiredService<DainnUserDbContext>();
        var roleService = scope.ServiceProvider.GetRequiredService<IRoleService>();

        var threads = await mylawDb.ChatThreads.AsNoTracking().ToListAsync(ct);
        if (threads.Count == 0) return;

        var ownerIds = threads.Select(t => t.OwnerId).Distinct().ToList();
        var tierByOwner = new Dictionary<Guid, string>();
        foreach (var ownerId in ownerIds)
        {
            var roles = await roleService.GetUserRolesAsync(ownerId, ct);
            tierByOwner[ownerId] = ResolveTier(roles.Select(r => r.Name).ToList());
        }

        var toDelete = new List<Guid>();
        foreach (var thread in threads)
        {
            if (!tierByOwner.TryGetValue(thread.OwnerId, out var tier)) tier = RoleSeeder.FreeRoleName;

            var retention = GetRetentionForTier(tier);
            var anchor = thread.LastMessageAt ?? thread.CreatedAt;
            if (anchor + retention < now)
            {
                toDelete.Add(thread.Id);
                continue;
            }
            // Auto-delete empty threads older than 1 day
            if (thread.LastMessageAt is null && thread.CreatedAt + TimeSpan.FromDays(1) < now)
            {
                toDelete.Add(thread.Id);
            }
        }

        if (toDelete.Count > 0)
        {
            await mylawDb.ChatThreads
                .Where(t => toDelete.Contains(t.Id))
                .ExecuteDeleteAsync(ct);
            _logger.LogInformation("Chat retention sweep deleted {Count} threads.", toDelete.Count);
        }
    }

    private TimeSpan GetRetentionForTier(string tier)
    {
        var raw = _config.GetValue<string>($"MyLaw:Chatbot:RetentionPerTier:{tier}");
        if (TimeSpan.TryParse(raw, out var ts)) return ts;
        return TimeSpan.FromMinutes(30);
    }

    private static string ResolveTier(IList<string> roleNames)
    {
        if (roleNames.Any(r => string.Equals(r, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase)))
            return RoleSeeder.AdminRoleName;
        if (roleNames.Any(r => string.Equals(r, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase)))
            return RoleSeeder.PremiumRoleName;
        if (roleNames.Any(r => string.Equals(r, RoleSeeder.PlusRoleName, StringComparison.OrdinalIgnoreCase)))
            return RoleSeeder.PlusRoleName;
        return RoleSeeder.FreeRoleName;
    }
}
