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
[Route("api/chat")]
public class ChatController : ControllerBase
{
    private const string ChatQueryMarker = "chat_query";
    private const string TonePreferenceMarker = "tone_preference_set";
    private const string ChatFeedbackMarker = "chat_feedback";
    private const string ToxicAttemptMarker = "chat_toxic_attempt";
    private const string ToxicEscalatedMarker = "chat_toxic_escalated";
    public const string TonePlain = "plain";
    public const string ToneTechnical = "technical";

    private readonly IRoleService _roles;
    private readonly IActivityService _activity;
    private readonly MindlexDbContext _db;
    private readonly Mindlex.Services.Documents.IPiiSanitizer _piiSanitizer;
    private readonly IConfiguration _config;
    private readonly ILogger<ChatController> _logger;

    public ChatController(
        IRoleService roles,
        IActivityService activity,
        MindlexDbContext db,
        Mindlex.Services.Documents.IPiiSanitizer piiSanitizer,
        IConfiguration config,
        ILogger<ChatController> logger)
    {
        _roles = roles;
        _activity = activity;
        _db = db;
        _piiSanitizer = piiSanitizer;
        _config = config;
        _logger = logger;
    }

    private Guid? CurrentUserId
    {
        get
        {
            var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
            return Guid.TryParse(sub, out var id) ? id : null;
        }
    }

    [HttpGet("quota")]
    public async Task<IActionResult> GetQuota(CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var tier = await ResolveTierAsync(userId.Value, ct);
        var tone = await ResolveEffectiveToneAsync(userId.Value, tier, ct);
        var (limit, used, allowed, resetAt) = await ComputeQuotaStateAsync(userId.Value, tier, ct);

        return Ok(new
        {
            quota = BuildQuotaPayload(tier, limit, used, allowed, resetAt),
            tone
        });
    }

    [HttpGet("tone")]
    public async Task<IActionResult> GetTone(CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var tier = await ResolveTierAsync(userId.Value, ct);
        var defaultTone = ResolveTone(tier);
        var effectiveTone = await ResolveEffectiveToneAsync(userId.Value, tier, ct);
        var canOverride = !string.Equals(tier, RoleSeeder.FreeRoleName, StringComparison.OrdinalIgnoreCase);

        return Ok(new
        {
            tone = effectiveTone,
            defaultTone,
            tier,
            description = effectiveTone == TonePlain
                ? "Simple, jargon-free, conversational language for general audiences."
                : "Precise legal terminology with statutory references and formal reasoning.",
            manualOverrideAvailable = canOverride,
            overridden = effectiveTone != defaultTone
        });
    }

    [HttpPut("tone")]
    public async Task<IActionResult> SetTonePreference([FromBody] SetTonePreferenceRequest req, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var tier = await ResolveTierAsync(userId.Value, ct);
        if (string.Equals(tier, RoleSeeder.FreeRoleName, StringComparison.OrdinalIgnoreCase))
        {
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Tone override is not available on the Free plan.",
                code = "tone_override_not_allowed"
            });
        }

        var metadata = JsonSerializer.Serialize(new
        {
            action = TonePreferenceMarker,
            tone = req.Tone,
            setAt = DateTime.UtcNow
        });

        await _activity.LogActivityAsync(
            userId.Value,
            ActivityType.ProfileUpdate,
            $"Chatbot tone preference set to '{req.Tone}'.",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString() ?? string.Empty,
            userAgent: Request.Headers.UserAgent.ToString() ?? string.Empty,
            metadata,
            ct);

        return Ok(new { tone = req.Tone });
    }

    [HttpPost("message")]
    public async Task<IActionResult> SendMessage([FromBody] ChatMessageRequest req, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var tier = await ResolveTierAsync(userId.Value, ct);

        var safetyResult = await ApplySafetyChecksAsync(userId.Value, req.Message, ct);
        if (safetyResult is not null) return safetyResult;

        var (limit, used, allowed, resetAt) = await ComputeQuotaStateAsync(userId.Value, tier, ct);

        if (!allowed)
        {
            return StatusCode(StatusCodes.Status429TooManyRequests, new
            {
                error = QuotaExceededMessage(tier),
                code = "quota_exceeded",
                placeholderText = "Limit reached. Upgrade to continue or return back tomorrow.",
                showUpgradeButton = !string.Equals(tier, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase),
                upgradeButtonLabel = "Upgrade Now",
                quota = BuildQuotaPayload(tier, limit, used, allowed: false, resetAt)
            });
        }

        var tone = await ResolveEffectiveToneAsync(userId.Value, tier, ct);
        var jurisdiction = DetectJurisdiction();

        var thread = await ResolveOrCreateThreadAsync(userId.Value, req.ThreadId, req.Message, ct);
        if (thread is null) return BadRequest(new { error = "Thread not found.", code = "thread_not_found" });

        var serverHistory = await _db.ChatMessages
            .Where(m => m.ThreadId == thread.Id)
            .OrderBy(m => m.CreatedAt)
            .AsNoTracking()
            .Select(m => new ChatHistoryEntry { Role = m.Role, Content = m.Content })
            .ToListAsync(ct);

        var historyForLlm = serverHistory.Count > 0 ? serverHistory : SanitizeHistory(req.History);

        var featureType = req.Mode == "drafting" ? "document_drafting" : "qa";
        var rawReply = req.Mode == "drafting"
            ? GenerateDraftStub(req.Message, tone)
            : await GenerateReplyAsync(req.Message, tone, historyForLlm, ct);

        var reply = rawReply;
        var anonymizedFields = 0;
        var anonymizationMessage = (string?)null;
        if (req.Mode == "drafting")
        {
            reply = _piiSanitizer.Sanitize(rawReply);
            anonymizedFields = _piiSanitizer.LastMatchCount;
            anonymizationMessage = _config.GetValue<string>("Mindlex:Anonymization:ToastMessage")
                ?? "All detected personal data has been successfully removed from your document.";

            try
            {
                await _activity.LogActivityAsync(
                    userId.Value,
                    ActivityType.ProfileUpdate,
                    "Document generated (drafting mode).",
                    ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString() ?? string.Empty,
                    userAgent: Request.Headers.UserAgent.ToString() ?? string.Empty,
                    metadata: JsonSerializer.Serialize(new
                    {
                        action = "document_generated",
                        mode = "drafting",
                        threadId = thread.Id,
                        piiMatchesRemoved = anonymizedFields,
                        at = DateTime.UtcNow
                    }),
                    ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to audit-log document generation for user {UserId}", userId.Value);
            }
        }

        var sources = req.Mode == "drafting"
            ? new List<ChatSource>()
            : BuildSources(tier, jurisdiction);
        var sourcesTitle = _config.GetValue<string>("Mindlex:Chatbot:SourcesTitle") ?? "Content supporting AI-generated response";
        var disclaimer = _config.GetValue<string>("Mindlex:Chatbot:Disclaimer") ?? string.Empty;

        var metadata = JsonSerializer.Serialize(new
        {
            action = ChatQueryMarker,
            timestamp = DateTime.UtcNow,
            tier,
            messageLength = req.Message.Length,
            replyLength = reply.Length
        });

        try
        {
            await _activity.LogActivityAsync(
                userId.Value,
                ActivityType.ProfileUpdate,
                "Chatbot query.",
                ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString() ?? string.Empty,
                userAgent: Request.Headers.UserAgent.ToString() ?? string.Empty,
                metadata: metadata,
                ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to log chat query for user {UserId}", userId.Value);
        }

        var now = DateTime.UtcNow;
        var userMsg = new ChatMessage
        {
            Id = Guid.NewGuid(),
            ThreadId = thread.Id,
            Role = "user",
            Content = req.Message,
            CreatedAt = now
        };
        var assistantMsg = new ChatMessage
        {
            Id = Guid.NewGuid(),
            ThreadId = thread.Id,
            Role = "assistant",
            Content = reply,
            CreatedAt = now.AddMilliseconds(1)
        };
        _db.ChatMessages.AddRange(userMsg, assistantMsg);

        thread.LastMessageAt = assistantMsg.CreatedAt;
        thread.UpdatedAt = assistantMsg.CreatedAt;
        if (string.IsNullOrWhiteSpace(thread.Title))
        {
            thread.Title = TruncateTitle(req.Message);
        }
        await _db.SaveChangesAsync(ct);

        var newUsed = used + 1;
        var actions = featureType == "document_drafting"
            ? new[] { "download", "save_to_folder" }
            : Array.Empty<string>();

        return Ok(new
        {
            messageId = assistantMsg.Id,
            threadId = thread.Id,
            threadTitle = thread.Title,
            reply,
            tone,
            featureType,
            actions,
            jurisdiction,
            sources,
            sourcesTitle = sources.Count > 0 ? sourcesTitle : null,
            disclaimer,
            anonymization = req.Mode == "drafting" ? new
            {
                piiMatchesRemoved = anonymizedFields,
                toastMessage = anonymizationMessage
            } : null,
            quota = BuildQuotaPayload(tier, limit, newUsed,
                allowed: limit < 0 || newUsed < limit,
                resetAt)
        });
    }

    private static string GenerateDraftStub(string userPrompt, string tone)
    {
        var topic = userPrompt.Trim();
        if (topic.Length > 100) topic = topic[..100] + "...";

        var draft = $$"""
            DOCUMENT TITLE: Draft based on request — "{{topic}}"

            PARTIES
            This agreement is made between:
              Party A: [...........................................]
              Party B: [...........................................]

            1. PURPOSE
            The purpose of this agreement is [.................................................].

            2. SCOPE OF WORK / TERMS
            [Describe the scope, deliverables, or terms relevant to this document. .........................................]

            3. CONSIDERATION / FEES
            The agreed compensation is [................] payable on [................].

            4. TERM AND TERMINATION
            This agreement commences on [................] and shall continue until [................].
            Either party may terminate with [........] days written notice.

            5. CONFIDENTIALITY
            Each party agrees to keep confidential all proprietary information disclosed under this agreement.

            6. GOVERNING LAW
            This agreement shall be governed by the laws of [................].

            7. SIGNATURES
              Party A signature: [.............................]   Date: [...........]
              Party B signature: [.............................]   Date: [...........]

            ---
            Would you like to add any more information? Click the download icon below to get an offline version of your draft.
            """;

        return draft;
    }

    [HttpGet("threads")]
    public async Task<IActionResult> ListThreads(CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var threads = await _db.ChatThreads
            .Where(t => t.OwnerId == userId.Value)
            .OrderByDescending(t => t.LastMessageAt ?? t.CreatedAt)
            .Select(t => new
            {
                id = t.Id,
                title = t.Title,
                createdAt = t.CreatedAt,
                lastMessageAt = t.LastMessageAt,
                messageCount = t.Messages.Count
            })
            .ToListAsync(ct);

        return Ok(threads);
    }

    [HttpGet("threads/{threadId:guid}")]
    public async Task<IActionResult> GetThread(Guid threadId, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var thread = await _db.ChatThreads
            .Include(t => t.Messages.OrderBy(m => m.CreatedAt))
            .FirstOrDefaultAsync(t => t.Id == threadId && t.OwnerId == userId.Value, ct);
        if (thread is null) return NotFound(new { error = "Thread not found." });

        return Ok(new
        {
            id = thread.Id,
            title = thread.Title,
            createdAt = thread.CreatedAt,
            lastMessageAt = thread.LastMessageAt,
            messages = thread.Messages.Select(m => new
            {
                id = m.Id,
                role = m.Role,
                content = m.Content,
                createdAt = m.CreatedAt
            })
        });
    }

    [HttpPatch("threads/{threadId:guid}")]
    public async Task<IActionResult> RenameThread(Guid threadId, [FromBody] RenameThreadRequest req, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var thread = await _db.ChatThreads.FirstOrDefaultAsync(t => t.Id == threadId && t.OwnerId == userId.Value, ct);
        if (thread is null) return NotFound(new { error = "Thread not found." });

        thread.Title = req.Title.Trim();
        thread.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return Ok(new { id = thread.Id, title = thread.Title });
    }

    [HttpPost("threads/{threadId:guid}/uploads")]
    // Single chat upload capped at ~30MB to cover 25MB file + multipart overhead.
    [RequestSizeLimit(30L * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 30L * 1024 * 1024)]
    public async Task<IActionResult> UploadChatDocument(Guid threadId, IFormFile? file, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var roleNames = (await _roles.GetUserRolesAsync(userId.Value, ct)).Select(r => r.Name).ToList();
        var allowed = roleNames.Any(r => string.Equals(r, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase)
                                       || string.Equals(r, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase));
        if (!allowed)
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Document upload via chatbot is available on the Premium plan only.",
                code = "upload_not_allowed"
            });

        if (file is null) return BadRequest(new { error = "No file provided." });

        if (Request.Form.Files.Count > 1)
            return BadRequest(new { error = "Multiple files selected. Please upload only one file at a time.", code = "multiple_files" });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext != ".docx" && ext != ".doc")
            return BadRequest(new { error = "Unsupported file type. Please upload a DOCX or DOC file.", code = "unsupported_type" });

        const long maxBytes = 25L * 1024 * 1024;
        if (file.Length > maxBytes)
            return BadRequest(new { error = "File too large. Maximum allowed size is 25MB.", code = "file_too_large" });

        var thread = await _db.ChatThreads
            .FirstOrDefaultAsync(t => t.Id == threadId && t.OwnerId == userId.Value, ct);
        if (thread is null) return NotFound(new { error = "Thread not found." });

        using var ms = new MemoryStream();
        await file.CopyToAsync(ms, ct);
        var bytes = ms.ToArray();

        var wordCount = Mindlex.Services.Documents.DocxTextExtractor.CountWords(bytes, ext);
        const int maxWords = 11000;
        if (wordCount > maxWords)
            return BadRequest(new
            {
                error = "The number of words exceeds the limit. Please upload the document with below 11.000 words",
                code = "word_count_exceeded",
                wordCount,
                maxWords
            });

        var upload = new ChatUpload
        {
            Id = Guid.NewGuid(),
            ThreadId = threadId,
            OwnerId = userId.Value,
            FileName = file.FileName,
            ContentType = file.ContentType,
            SizeBytes = bytes.LongLength,
            WordCount = wordCount,
            Content = bytes,
            CreatedAt = DateTime.UtcNow
        };
        _db.ChatUploads.Add(upload);
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            id = upload.Id,
            threadId,
            fileName = upload.FileName,
            sizeBytes = upload.SizeBytes,
            wordCount,
            createdAt = upload.CreatedAt
        });
    }

    [HttpPost("threads/{threadId:guid}/uploads/{uploadId:guid}/compliance-check")]
    public async Task<IActionResult> ComplianceCheck(
        Guid threadId,
        Guid uploadId,
        [FromServices] Mindlex.Services.Documents.IComplianceChecker checker,
        CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var roleNames = (await _roles.GetUserRolesAsync(userId.Value, ct)).Select(r => r.Name).ToList();
        var allowed = roleNames.Any(r => string.Equals(r, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase)
                                       || string.Equals(r, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase));
        if (!allowed)
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Compliance check is available on the Premium plan only.",
                code = "compliance_check_not_allowed"
            });

        var upload = await _db.ChatUploads
            .FirstOrDefaultAsync(u => u.Id == uploadId && u.ThreadId == threadId && u.OwnerId == userId.Value, ct);
        if (upload is null) return NotFound(new { error = "Upload not found." });

        var ext = Path.GetExtension(upload.FileName).ToLowerInvariant();
        var text = Mindlex.Services.Documents.DocxTextExtractor.ExtractText(upload.Content, ext);
        var issues = checker.Check(text);

        return Ok(new
        {
            uploadId,
            issuesFound = issues.Count,
            issues = issues.Select(i => new
            {
                name = i.Name,
                rawText = i.RawText,
                explanation = i.Explanation,
                suggestedClause = i.SuggestedClause
            }),
            noIssuesMessage = issues.Count == 0
                ? "Your document contains all required clauses and no compliance gaps were detected."
                : null
        });
    }

    [HttpPost("threads/{threadId:guid}/uploads/{uploadId:guid}/risk-check")]
    public async Task<IActionResult> RiskCheck(
        Guid threadId,
        Guid uploadId,
        [FromServices] Mindlex.Services.Documents.IRiskAnalyzer analyzer,
        CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var roleNames = (await _roles.GetUserRolesAsync(userId.Value, ct)).Select(r => r.Name).ToList();
        var allowed = roleNames.Any(r => string.Equals(r, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase)
                                       || string.Equals(r, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase));
        if (!allowed)
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Risk analysis is available on the Premium plan only.",
                code = "risk_check_not_allowed"
            });

        var upload = await _db.ChatUploads
            .FirstOrDefaultAsync(u => u.Id == uploadId && u.ThreadId == threadId && u.OwnerId == userId.Value, ct);
        if (upload is null) return NotFound(new { error = "Upload not found." });

        var ext = Path.GetExtension(upload.FileName).ToLowerInvariant();
        var text = Mindlex.Services.Documents.DocxTextExtractor.ExtractText(upload.Content, ext);
        var risks = analyzer.Analyze(text);

        return Ok(new
        {
            uploadId,
            risksFound = risks.Count,
            risks = risks.Select(r => new
            {
                name = r.Name,
                rawText = r.RawText,
                explanation = r.Explanation,
                suggestedRewrite = r.SuggestedRewrite
            }),
            noRisksMessage = risks.Count == 0
                ? "No vague or high-risk clauses were identified in your document."
                : null
        });
    }

    [HttpPost("threads/{threadId:guid}/uploads/{uploadId:guid}/report")]
    public async Task<IActionResult> GenerateComplianceReport(
        Guid threadId,
        Guid uploadId,
        [FromServices] Mindlex.Services.Documents.IComplianceChecker complianceChecker,
        [FromServices] Mindlex.Services.Documents.IRiskAnalyzer riskAnalyzer,
        CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var roleNames = (await _roles.GetUserRolesAsync(userId.Value, ct)).Select(r => r.Name).ToList();
        var allowed = roleNames.Any(r => string.Equals(r, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase)
                                       || string.Equals(r, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase));
        if (!allowed)
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Compliance report download is available on the Premium plan only.",
                code = "report_not_allowed"
            });

        var upload = await _db.ChatUploads
            .FirstOrDefaultAsync(u => u.Id == uploadId && u.ThreadId == threadId && u.OwnerId == userId.Value, ct);
        if (upload is null) return NotFound(new { error = "Upload not found." });

        var ext = Path.GetExtension(upload.FileName).ToLowerInvariant();
        var text = Mindlex.Services.Documents.DocxTextExtractor.ExtractText(upload.Content, ext);
        var compliance = complianceChecker.Check(text);
        var risks = riskAnalyzer.Analyze(text);

        var sections = new List<(string Heading, string Body)>
        {
            ("Document Metadata",
             $"File name: {upload.FileName}\n" +
             $"Uploaded at: {upload.CreatedAt:yyyy-MM-dd HH:mm} UTC\n" +
             $"File size: {upload.SizeBytes:N0} bytes\n" +
             $"Word count: {upload.WordCount:N0}")
        };

        if (compliance.Count == 0)
        {
            sections.Add(("Compliance Issues",
                "Your document contains all required clauses and no compliance gaps were detected."));
        }
        else
        {
            sections.Add(("Compliance Issues", string.Empty));
            for (var i = 0; i < compliance.Count; i++)
            {
                var c = compliance[i];
                sections.Add(($"{i + 1}. {c.Name}",
                    $"Source snippet:\n{c.RawText}\n\nExplanation:\n{c.Explanation}\n\nSuggested clause:\n{c.SuggestedClause}"));
            }
        }

        if (risks.Count == 0)
        {
            sections.Add(("Risk Issues",
                "No vague or high-risk clauses were identified in your document."));
        }
        else
        {
            sections.Add(("Risk Issues", string.Empty));
            for (var i = 0; i < risks.Count; i++)
            {
                var r = risks[i];
                sections.Add(($"{i + 1}. {r.Name}",
                    $"Source snippet:\n{r.RawText}\n\nExplanation:\n{r.Explanation}\n\nSuggested rewrite:\n{r.SuggestedRewrite}"));
            }
        }

        var bytes = Mindlex.Services.DocxBuilder.BuildFromText(
            $"Mindlex Compliance Report — {upload.FileName}",
            sections);

        var fileBase = Path.GetFileNameWithoutExtension(upload.FileName);
        var reportName = $"Compliance_Report_{fileBase}_{DateTime.UtcNow:yyyyMMdd_HHmm}.docx";

        return File(bytes,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            reportName);
    }

    [HttpDelete("threads/{threadId:guid}/uploads/{uploadId:guid}")]
    public async Task<IActionResult> RemoveChatUpload(Guid threadId, Guid uploadId, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var rows = await _db.ChatUploads
            .Where(u => u.Id == uploadId && u.ThreadId == threadId && u.OwnerId == userId.Value)
            .ExecuteDeleteAsync(ct);
        if (rows == 0) return NotFound(new { error = "Upload not found." });
        return NoContent();
    }

    [HttpDelete("threads/{threadId:guid}")]
    public async Task<IActionResult> DeleteThread(Guid threadId, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var rows = await _db.ChatThreads
            .Where(t => t.Id == threadId && t.OwnerId == userId.Value)
            .ExecuteDeleteAsync(ct);

        if (rows == 0) return NotFound(new { error = "Thread not found." });
        return NoContent();
    }

    private async Task<ChatThread?> ResolveOrCreateThreadAsync(Guid userId, Guid? requestedThreadId, string firstMessage, CancellationToken ct)
    {
        if (requestedThreadId.HasValue)
        {
            return await _db.ChatThreads
                .FirstOrDefaultAsync(t => t.Id == requestedThreadId.Value && t.OwnerId == userId, ct);
        }

        var now = DateTime.UtcNow;
        var thread = new ChatThread
        {
            Id = Guid.NewGuid(),
            OwnerId = userId,
            Title = null,
            CreatedAt = now,
            UpdatedAt = now,
            LastMessageAt = null
        };
        _db.ChatThreads.Add(thread);
        return thread;
    }

    private static string TruncateTitle(string firstMessage)
    {
        var trimmed = firstMessage.Trim();
        return trimmed.Length <= 30 ? trimmed : trimmed.Substring(0, 30);
    }

    [HttpPost("feedback")]
    public async Task<IActionResult> SubmitFeedback([FromBody] ChatFeedbackRequest req, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var (activities, _) = await _activity.GetActivityLogAsync(
            userId.Value, pageNumber: 1, pageSize: 100,
            activityType: ActivityType.ProfileUpdate,
            startDate: null, endDate: null, ct);

        var messageIdNeedle = $"\"messageId\":\"{req.MessageId}\"";
        var alreadyExists = activities.Any(a =>
            (a.Metadata?.Contains(ChatFeedbackMarker, StringComparison.OrdinalIgnoreCase) ?? false)
            && (a.Metadata?.Contains(messageIdNeedle, StringComparison.OrdinalIgnoreCase) ?? false));

        if (alreadyExists)
        {
            return Conflict(new
            {
                error = "Feedback for this message has already been recorded and cannot be changed.",
                code = "feedback_already_submitted"
            });
        }

        var metadata = JsonSerializer.Serialize(new
        {
            action = ChatFeedbackMarker,
            messageId = req.MessageId,
            type = req.Type,
            at = DateTime.UtcNow
        });

        await _activity.LogActivityAsync(
            userId.Value,
            ActivityType.ProfileUpdate,
            $"Chat feedback recorded ({req.Type}) for message {req.MessageId}.",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString() ?? string.Empty,
            userAgent: Request.Headers.UserAgent.ToString() ?? string.Empty,
            metadata,
            ct);

        return Ok(new { messageId = req.MessageId, type = req.Type });
    }

    private List<ChatSource> BuildSources(string tier, string jurisdiction)
    {
        var cap = _config.GetValue<int?>($"Mindlex:Chatbot:MaxSources:{tier}") ?? 5;

        var allowedDomains = _config.GetSection("Mindlex:Chatbot:AllowedExternalDomains").Get<string[]>()
            ?? Array.Empty<string>();

        var priority = _config.GetSection($"Mindlex:Chatbot:JurisdictionPriorities:{jurisdiction}").Get<string[]>()
            ?? _config.GetSection("Mindlex:Chatbot:JurisdictionPriorities:Global").Get<string[]>()
            ?? Array.Empty<string>();

        var stub = new List<ChatSource>
        {
            new() { Type = "external", Label = "https://www.cylaw.org/cgi-bin/open.pl?file=/apo/example", Url = "https://www.cylaw.org/cgi-bin/open.pl?file=/apo/example" },
            new() { Type = "external", Label = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:example", Url = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:example" },
            new() { Type = "external", Label = "https://www.bailii.org/uk/cases/UKSC/example", Url = "https://www.bailii.org/uk/cases/UKSC/example" },
            new() { Type = "external", Label = "https://curia.europa.eu/juris/example", Url = "https://curia.europa.eu/juris/example" },
            new() { Type = "external", Label = "https://hudoc.echr.coe.int/eng/example", Url = "https://hudoc.echr.coe.int/eng/example" },
            new() { Type = "internal", Label = "Services Agreement Template" }
        };

        var whitelisted = stub
            .Where(s => s.Type == "internal"
                       || (s.Url is not null && allowedDomains.Any(d => s.Url.Contains(d, StringComparison.OrdinalIgnoreCase))))
            .ToList();

        var sorted = whitelisted
            .OrderBy(s => DomainPriorityIndex(s, priority))
            .ThenBy(s => s.Type == "internal" ? 1 : 0)
            .Take(cap)
            .ToList();

        return sorted;
    }

    private static int DomainPriorityIndex(ChatSource source, string[] priority)
    {
        if (source.Type == "internal" || source.Url is null) return int.MaxValue;
        for (var i = 0; i < priority.Length; i++)
        {
            if (source.Url.Contains(priority[i], StringComparison.OrdinalIgnoreCase)) return i;
        }
        return int.MaxValue - 1;
    }

    private async Task<IActionResult?> ApplySafetyChecksAsync(Guid userId, string message, CancellationToken ct)
    {
        if (IsToxic(message))
        {
            var escalated = await RecordToxicAttemptAsync(userId, message, ct);
            var disclaimer = _config.GetValue<string>("Mindlex:Chatbot:Disclaimer") ?? string.Empty;
            return Ok(new
            {
                blocked = true,
                category = "toxic",
                reply = "I'm sorry, but abusive language is not tolerated. " +
                       "Per the Mindlex Terms of Service and Usage Policy, I can only respond to respectful, legal-related questions. " +
                       "If you have a legal question, please share it respectfully.",
                escalated,
                disclaimer
            });
        }

        if (IsGreeting(message))
        {
            return Ok(new
            {
                category = "greeting",
                reply = "Hi! I'm doing well, thank you. I'm here to help with legal questions — what would you like to ask?",
                disclaimer = _config.GetValue<string>("Mindlex:Chatbot:Disclaimer") ?? string.Empty
            });
        }

        return null;
    }

    private bool IsToxic(string message)
    {
        var patterns = _config.GetSection("Mindlex:Chatbot:Safety:ToxicPatterns").Get<string[]>()
            ?? Array.Empty<string>();
        return patterns.Any(p => System.Text.RegularExpressions.Regex.IsMatch(message,
            p, System.Text.RegularExpressions.RegexOptions.IgnoreCase));
    }

    private bool IsGreeting(string message)
    {
        var patterns = _config.GetSection("Mindlex:Chatbot:Safety:GreetingPatterns").Get<string[]>()
            ?? Array.Empty<string>();
        return patterns.Any(p => System.Text.RegularExpressions.Regex.IsMatch(message,
            p, System.Text.RegularExpressions.RegexOptions.IgnoreCase));
    }

    private async Task<bool> RecordToxicAttemptAsync(Guid userId, string message, CancellationToken ct)
    {
        var threshold = _config.GetValue<int?>("Mindlex:Chatbot:Safety:EscalationThreshold") ?? 3;
        var windowHours = _config.GetValue<int?>("Mindlex:Chatbot:Safety:EscalationWindowHours") ?? 24;
        var windowStart = DateTime.UtcNow.AddHours(-windowHours);

        await _activity.LogActivityAsync(
            userId,
            ActivityType.ProfileUpdate,
            "Chatbot detected toxic message.",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString() ?? string.Empty,
            userAgent: Request.Headers.UserAgent.ToString() ?? string.Empty,
            metadata: JsonSerializer.Serialize(new
            {
                action = ToxicAttemptMarker,
                at = DateTime.UtcNow,
                excerpt = message.Length > 200 ? message[..200] : message
            }),
            ct);

        var (activities, _) = await _activity.GetActivityLogAsync(
            userId, pageNumber: 1, pageSize: 100,
            activityType: ActivityType.ProfileUpdate,
            startDate: windowStart, endDate: null, ct);

        var toxicCount = activities.Count(a =>
            a.Metadata?.Contains(ToxicAttemptMarker, StringComparison.OrdinalIgnoreCase) ?? false);

        if (toxicCount < threshold) return false;

        var alreadyEscalated = activities.Any(a =>
            a.Metadata?.Contains(ToxicEscalatedMarker, StringComparison.OrdinalIgnoreCase) ?? false);
        if (alreadyEscalated) return true;

        await _activity.LogActivityAsync(
            userId,
            ActivityType.AccountSuspended,
            $"Chatbot abuse escalation triggered after {toxicCount} toxic attempts in {windowHours}h.",
            ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString() ?? string.Empty,
            userAgent: Request.Headers.UserAgent.ToString() ?? string.Empty,
            metadata: JsonSerializer.Serialize(new
            {
                action = ToxicEscalatedMarker,
                triggeredAt = DateTime.UtcNow,
                attemptCount = toxicCount,
                windowHours
            }),
            ct);

        _logger.LogWarning("Chatbot abuse escalation: user {UserId} hit {Count} toxic attempts in {Window}h.",
            userId, toxicCount, windowHours);

        return true;
    }

    private string DetectJurisdiction()
    {
        var country = Request.Headers["CF-IPCountry"].ToString();
        if (string.IsNullOrWhiteSpace(country)) country = Request.Headers["X-Country"].ToString();
        if (string.IsNullOrWhiteSpace(country)) return "Global";

        country = country.Trim().ToUpperInvariant();
        return country switch
        {
            "CY" => "Cyprus",
            "GB" or "UK" => "UK",
            _ => "Global"
        };
    }

    private static string ResolveTone(string tier)
    {
        return string.Equals(tier, RoleSeeder.FreeRoleName, StringComparison.OrdinalIgnoreCase)
            ? TonePlain
            : ToneTechnical;
    }

    private async Task<string> ResolveEffectiveToneAsync(Guid userId, string tier, CancellationToken ct)
    {
        var defaultTone = ResolveTone(tier);

        if (string.Equals(tier, RoleSeeder.FreeRoleName, StringComparison.OrdinalIgnoreCase))
            return defaultTone;

        var (activities, _) = await _activity.GetActivityLogAsync(
            userId, pageNumber: 1, pageSize: 50,
            activityType: ActivityType.ProfileUpdate,
            startDate: null, endDate: null, ct);

        var latestPreference = activities
            .Where(a => a.Metadata?.Contains(TonePreferenceMarker, StringComparison.OrdinalIgnoreCase) ?? false)
            .OrderByDescending(a => a.CreatedAt)
            .FirstOrDefault();

        if (latestPreference?.Metadata is null) return defaultTone;

        try
        {
            using var doc = JsonDocument.Parse(latestPreference.Metadata);
            if (doc.RootElement.TryGetProperty("tone", out var node))
            {
                var saved = node.GetString();
                if (saved == TonePlain || saved == ToneTechnical) return saved;
            }
        }
        catch
        {
            // fall through to default
        }

        return defaultTone;
    }

    private async Task<string> ResolveTierAsync(Guid userId, CancellationToken ct)
    {
        var roleNames = (await _roles.GetUserRolesAsync(userId, ct)).Select(r => r.Name).ToList();
        if (roleNames.Any(r => string.Equals(r, RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase)))
            return RoleSeeder.PremiumRoleName; // Admin gets Premium-level access
        if (roleNames.Any(r => string.Equals(r, RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase)))
            return RoleSeeder.PremiumRoleName;
        if (roleNames.Any(r => string.Equals(r, RoleSeeder.PlusRoleName, StringComparison.OrdinalIgnoreCase)))
            return RoleSeeder.PlusRoleName;
        return RoleSeeder.FreeRoleName;
    }

    private async Task<(int Limit, int Used, bool Allowed, DateTime ResetAt)> ComputeQuotaStateAsync(
        Guid userId, string tier, CancellationToken ct)
    {
        var limit = _config.GetValue<int?>($"Mindlex:Chatbot:Quotas:{tier}") ?? 0;
        var resetHour = _config.GetValue<int?>("Mindlex:Chatbot:DailyResetHourUtc") ?? 4;

        var now = DateTime.UtcNow;
        var todaysResetAt = new DateTime(now.Year, now.Month, now.Day, resetHour, 0, 0, DateTimeKind.Utc);
        var windowStart = now < todaysResetAt ? todaysResetAt.AddDays(-1) : todaysResetAt;
        var nextResetAt = windowStart.AddDays(1);

        if (limit < 0)
        {
            return (limit, 0, true, nextResetAt);
        }

        var (activities, _) = await _activity.GetActivityLogAsync(
            userId, pageNumber: 1, pageSize: 100,
            activityType: ActivityType.ProfileUpdate,
            startDate: windowStart, endDate: now, ct);

        var used = activities.Count(a =>
            a.Metadata?.Contains(ChatQueryMarker, StringComparison.OrdinalIgnoreCase) ?? false);

        var allowed = used < limit;
        return (limit, used, allowed, nextResetAt);
    }

    private static string QuotaExceededMessage(string tier) => tier switch
    {
        var t when string.Equals(t, RoleSeeder.PlusRoleName, StringComparison.OrdinalIgnoreCase) =>
            "You've reached your daily queries. Upgrade to Premium for unlimited access.",
        _ => "You've reached your daily queries. Consider upgrading for more access."
    };

    private static object BuildQuotaPayload(string tier, int limit, int used, bool allowed, DateTime resetAt) => new
    {
        tier,
        limit = limit < 0 ? (int?)null : limit,
        used,
        remaining = limit < 0 ? (int?)null : Math.Max(0, limit - used),
        unlimited = limit < 0,
        allowed,
        resetAtUtc = resetAt
    };

    private static List<ChatHistoryEntry> SanitizeHistory(IList<ChatHistoryEntry> raw)
    {
        if (raw is null || raw.Count == 0) return new();
        const int MaxTurns = 20;

        return raw
            .Where(h => !string.IsNullOrWhiteSpace(h.Content)
                       && (h.Role == "user" || h.Role == "assistant"))
            .TakeLast(MaxTurns)
            .ToList();
    }

    private Task<string> GenerateReplyAsync(
        string userMessage,
        string tone,
        IReadOnlyList<ChatHistoryEntry> history,
        CancellationToken ct)
    {
        var trimmed = userMessage.Trim();
        if (trimmed.Length > 200) trimmed = trimmed[..200] + "...";

        var contextHint = history.Count > 0
            ? $" (Follow-up: {history.Count} prior turn(s) supplied — LLM will use as context.)"
            : string.Empty;

        var stub = tone == TonePlain
            ? $"[Plain] You asked: \"{trimmed}\".{contextHint} " +
              "In simple terms, the law is the set of rules that govern how people and organisations should behave. " +
              "(LLM integration pending — system prompt will instruct plain-language responses without legal jargon.)"
            : $"[Technical] Query: \"{trimmed}\".{contextHint} " +
              "The relevant analysis would address statutory provisions, applicable case law, and doctrinal principles. " +
              "(LLM integration pending — system prompt will instruct precise legal terminology with citations.)";

        return Task.FromResult(stub);
    }
}
