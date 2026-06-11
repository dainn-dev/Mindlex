using DainnUser.Core.Interfaces.Services;

namespace MyLaw.Services;

public sealed class RoleSeeder : IHostedService
{
    public const string FreeRoleName = "Free";
    public const string PlusRoleName = "Plus";
    public const string PremiumRoleName = "Premium";
    public const string AdminRoleName = "Admin";

    public static readonly string[] SubscriptionRoles = { FreeRoleName, PlusRoleName, PremiumRoleName };

    private static readonly (string Name, string Description)[] Roles =
    {
        (FreeRoleName, "Default role assigned to every newly registered user."),
        (PlusRoleName, "Plus subscription tier."),
        (PremiumRoleName, "Premium subscription tier."),
        (AdminRoleName, "Platform administrator with elevated privileges.")
    };

    private readonly IServiceProvider _services;
    private readonly ILogger<RoleSeeder> _logger;

    public RoleSeeder(IServiceProvider services, ILogger<RoleSeeder> logger)
    {
        _services = services;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = _services.CreateScope();
        var roleService = scope.ServiceProvider.GetRequiredService<IRoleService>();

        var existing = await roleService.GetAllRolesAsync(cancellationToken);
        var existingNames = existing.Select(r => r.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var (name, description) in Roles)
        {
            if (existingNames.Contains(name))
            {
                _logger.LogDebug("Role '{Role}' already exists, skipping seed.", name);
                continue;
            }

            await roleService.CreateRoleAsync(name, description, Array.Empty<string>(), cancellationToken);
            _logger.LogInformation("Seeded role '{Role}'.", name);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
