using DainnStripe;
using DainnStripe.Data;
using DainnUser.Infrastructure;
using DainnUser.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Mindlex.Data;
using Mindlex.Services;
using Mindlex.Services.News;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDainnUser(builder.Configuration, options =>
{
    options.EnableSocialLogin = true;
    options.EnableTwoFactor = false;
    options.RequireEmailVerification = true;
    options.EnableAccountLockout = true;
    options.EnableSessionManagement = true;
    options.EnableActivityLogging = true;
    options.PasswordResetTokenExpirationHours = 1;
});

builder.Services.AddDainnStripe(builder.Configuration);

builder.Services.AddDbContext<MindlexDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("Mindlex")));

builder.Services.AddHostedService<RoleSeeder>();
builder.Services.AddHostedService<ChatThreadRetentionSweeperService>();
builder.Services.AddHostedService<AdminSeeder>();
builder.Services.AddHostedService<InactiveAccountSweeperService>();
builder.Services.AddHostedService<NewsIngestionService>();
builder.Services.AddScoped<INewsSourceFetcher, CylawFetcher>();
builder.Services.AddScoped<INewsSourceFetcher, BailiiFetcher>();
builder.Services.AddScoped<INewsSourceFetcher, EchrFetcher>();
builder.Services.AddScoped<INewsSourceFetcher, CuriaFetcher>();
builder.Services.AddScoped<Sr2DataRetentionService>();
builder.Services.AddScoped<Mindlex.Services.Documents.IDocumentClassifier, Mindlex.Services.Documents.KeywordDocumentClassifier>();
builder.Services.AddScoped<Mindlex.Services.Documents.IPiiSanitizer, Mindlex.Services.Documents.RegexPiiSanitizer>();
builder.Services.AddScoped<Mindlex.Services.Documents.IUploadAnonymizer, Mindlex.Services.Documents.UploadAnonymizer>();
builder.Services.AddScoped<Mindlex.Services.Documents.IComplianceChecker, Mindlex.Services.Documents.StubComplianceChecker>();
builder.Services.AddScoped<Mindlex.Services.Documents.IRiskAnalyzer, Mindlex.Services.Documents.StubRiskAnalyzer>();
builder.Services.AddScoped<DainnStripe.Interfaces.IStripeWebhookHandler, MindlexSubscriptionWebhookHandler>();
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Apply EF Core schema setup on startup so seeders can query their tables.
//
// DainnUser / DainnStripe migrations from the upstream packages are broken on
// PostgreSQL (their `InsertDataOperation` seed rows mis-type Guid as string,
// blowing up NpgsqlMigrationsSqlGenerator). Until those libs are patched we
// fall back to `EnsureCreatedAsync` for them — it builds the schema directly
// from the EF model and skips the bad seed inserts entirely. RoleSeeder /
// AdminSeeder below populate the rows we actually need.
//
// MindlexDbContext is our own and has clean migrations, so it still uses
// `MigrateAsync` to keep history-table tracking working.
using (var scope = app.Services.CreateScope())
{
    var sp = scope.ServiceProvider;
    var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger("Migrations");

    async Task EnsureCreatedAsync<TCtx>() where TCtx : DbContext
    {
        try
        {
            var ctx = sp.GetRequiredService<TCtx>();
            var created = await ctx.Database.EnsureCreatedAsync();
            logger.LogInformation("{Context}: schema {Status}",
                typeof(TCtx).Name, created ? "created" : "already present");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to EnsureCreated {Context}", typeof(TCtx).Name);
            throw;
        }
    }

    async Task MigrateAsync<TCtx>() where TCtx : DbContext
    {
        try
        {
            var ctx = sp.GetRequiredService<TCtx>();
            await ctx.Database.MigrateAsync();
            logger.LogInformation("Migrated {Context}", typeof(TCtx).Name);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to migrate {Context}", typeof(TCtx).Name);
            throw;
        }
    }

    await EnsureCreatedAsync<DainnUserDbContext>();
    await EnsureCreatedAsync<DainnStripeDbContext>();
    await MigrateAsync<MindlexDbContext>();
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.UseDainnUser();
app.UseDainnStripe();

app.MapDainnStripeWebhooks("/api/stripe/webhook");
app.MapDainnStripeCatalogEndpoints("/api/stripe/catalog", true);
app.MapDainnStripeCommerceEndpoints("/api/stripe/commerce", true);

app.MapControllers();

app.Run();
