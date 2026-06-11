using DainnUser.Core.Enums;
using DainnUser.Core.Interfaces.Services;
using DainnUser.Core.Models.Profile;
using DainnUser.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace MyLaw.Services;

public sealed class AdminAccountOptions
{
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public sealed class AdminSeeder : IHostedService
{
    private readonly IServiceProvider _services;
    private readonly IConfiguration _config;
    private readonly ILogger<AdminSeeder> _logger;

    public AdminSeeder(IServiceProvider services, IConfiguration config, ILogger<AdminSeeder> logger)
    {
        _services = services;
        _config = config;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var admins = _config.GetSection("MyLaw:Admins").Get<List<AdminAccountOptions>>() ?? new();
        if (admins.Count == 0)
        {
            _logger.LogWarning("No predefined admins configured under MyLaw:Admins; skipping admin seed.");
            return;
        }

        using var scope = _services.CreateScope();
        var auth = scope.ServiceProvider.GetRequiredService<IAuthenticationService>();
        var roles = scope.ServiceProvider.GetRequiredService<IRoleService>();
        var profiles = scope.ServiceProvider.GetRequiredService<IProfileService>();
        var db = scope.ServiceProvider.GetRequiredService<DainnUserDbContext>();

        var allRoles = await roles.GetAllRolesAsync(cancellationToken);
        var adminRole = allRoles.FirstOrDefault(r =>
            string.Equals(r.Name, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase));
        if (adminRole is null)
        {
            _logger.LogError("Admin role not found during admin seed. RoleSeeder must run first.");
            return;
        }

        foreach (var admin in admins)
        {
            if (string.IsNullOrWhiteSpace(admin.Email) || string.IsNullOrWhiteSpace(admin.Password))
            {
                _logger.LogWarning("Skipping admin entry with missing email or password.");
                continue;
            }

            var existing = await db.Users.FirstOrDefaultAsync(u => u.Email == admin.Email, cancellationToken);

            Guid userId;
            if (existing is null)
            {
                try
                {
                    userId = await auth.RegisterAsync(admin.Email, admin.Email, admin.Password, cancellationToken);
                    _logger.LogInformation("Seeded admin account {Email}.", admin.Email);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to register admin {Email} (email service unavailable?). Skipping.", admin.Email);
                    continue;
                }

                try
                {
                    await profiles.UpdateProfileAsync(userId, new UpdateProfileDto
                    {
                        DisplayName = admin.FullName
                    }, cancellationToken);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to update profile for admin {Email}.", admin.Email);
                }
            }
            else
            {
                userId = existing.Id;
                _logger.LogDebug("Admin account {Email} already exists; ensuring role + activation.", admin.Email);
            }

            var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);
            if (user is not null)
            {
                var dirty = false;
                if (!user.EmailVerified)
                {
                    user.EmailVerified = true;
                    dirty = true;
                }
                if (user.Status != UserStatus.Active)
                {
                    user.Status = UserStatus.Active;
                    dirty = true;
                }
                if (dirty)
                {
                    await db.SaveChangesAsync(cancellationToken);
                }
            }

            await roles.AssignRoleToUserAsync(userId, adminRole.Id, cancellationToken);
        }
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
