using DainnStripe;
using DainnStripe.Data;
using DainnUser.Infrastructure;
using DainnUser.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using MyLaw.Data;
using MyLaw.Services;
using MyLaw.Services.News;
using Npgsql;

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

var myLawDsBuilder = new NpgsqlDataSourceBuilder(
    builder.Configuration.GetConnectionString("MyLaw"));
myLawDsBuilder.UseVector();
var myLawDataSource = myLawDsBuilder.Build();
builder.Services.AddDbContext<MyLawDbContext>(opt =>
    opt.UseNpgsql(myLawDataSource, o => o.UseVector()));

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
builder.Services.AddScoped<MyLaw.Services.Documents.IDocumentClassifier, MyLaw.Services.Documents.KeywordDocumentClassifier>();
builder.Services.AddScoped<MyLaw.Services.Documents.IPiiSanitizer, MyLaw.Services.Documents.RegexPiiSanitizer>();
builder.Services.AddScoped<MyLaw.Services.Documents.IUploadAnonymizer, MyLaw.Services.Documents.UploadAnonymizer>();
builder.Services.AddScoped<MyLaw.Services.Documents.IComplianceChecker, MyLaw.Services.Documents.StubComplianceChecker>();
builder.Services.AddScoped<MyLaw.Services.Documents.IRiskAnalyzer, MyLaw.Services.Documents.StubRiskAnalyzer>();
builder.Services.AddScoped<DainnStripe.Interfaces.IStripeWebhookHandler, MyLawSubscriptionWebhookHandler>();
builder.Services.AddScoped<ILegalSearchService, LegalSearchService>();
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
// MyLawDbContext is our own and has clean migrations, so it still uses
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
            // EnsureCreatedAsync returns false if the database already exists (even if
            // this context's tables are missing). Use GetPendingMigrationsAsync first;
            // if no migrations exist for this context, fall back to creating tables
            // via the RelationalDatabaseCreator which handles the multi-context case.
            var databaseCreator = ctx.Database.GetService<Microsoft.EntityFrameworkCore.Storage.IRelationalDatabaseCreator>();
            if (!await databaseCreator.ExistsAsync())
            {
                await ctx.Database.EnsureCreatedAsync();
                logger.LogInformation("{Context}: schema created (new database)", typeof(TCtx).Name);
            }
            else
            {
                // Database exists — create only this context's tables if missing
                try
                {
                    await databaseCreator.CreateTablesAsync();
                    logger.LogInformation("{Context}: tables created", typeof(TCtx).Name);
                }
                catch (Npgsql.PostgresException ex) when (ex.SqlState == "42P07") // duplicate_table
                {
                    logger.LogInformation("{Context}: tables already present", typeof(TCtx).Name);
                }
            }
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
    await MigrateAsync<MyLawDbContext>();
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
