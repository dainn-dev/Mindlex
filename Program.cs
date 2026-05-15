using DainnStripe;
using DainnUser.Infrastructure;
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
