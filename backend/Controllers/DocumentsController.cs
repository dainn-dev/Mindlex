using System.Globalization;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using DainnUser.Core.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MyLaw.Data;
using MyLaw.Services;
using EmailAttachment = DainnUser.Core.Interfaces.Services.EmailAttachment;

namespace MyLaw.Controllers;

[ApiController]
[Authorize]
[Route("api")]
public class DocumentsController : ControllerBase
{
    private const long MaxBytes = 25L * 1024 * 1024;

    private readonly MyLawDbContext _db;
    private readonly IRoleService _roles;
    private readonly IProfileService _profiles;
    private readonly IEmailService _email;
    private readonly MyLaw.Services.Documents.IDocumentClassifier _classifier;
    private readonly MyLaw.Services.Documents.IUploadAnonymizer _uploadAnonymizer;
    private readonly IActivityService _activity;
    private readonly IConfiguration _config;
    private readonly ILogger<DocumentsController> _logger;

    public DocumentsController(
        MyLawDbContext db,
        IRoleService roles,
        IProfileService profiles,
        IEmailService email,
        MyLaw.Services.Documents.IDocumentClassifier classifier,
        MyLaw.Services.Documents.IUploadAnonymizer uploadAnonymizer,
        IActivityService activity,
        IConfiguration config,
        ILogger<DocumentsController> logger)
    {
        _db = db;
        _roles = roles;
        _profiles = profiles;
        _email = email;
        _classifier = classifier;
        _uploadAnonymizer = uploadAnonymizer;
        _activity = activity;
        _config = config;
        _logger = logger;
    }

    private async Task<bool> CanManageDriveAsync(Guid userId, CancellationToken ct)
    {
        var roleNames = (await _roles.GetUserRolesAsync(userId, ct)).Select(r => r.Name).ToList();
        return roleNames.Any(r => string.Equals(r, Services.RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase)
                                 || string.Equals(r, Services.RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase));
    }

    private Guid? CurrentUserId
    {
        get
        {
            var sub = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? User.FindFirstValue("sub");
            return Guid.TryParse(sub, out var id) ? id : null;
        }
    }

    [HttpPost("chat/messages/{messageId:guid}/save-to-folder")]
    public async Task<IActionResult> SaveToFolder(Guid messageId, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var roleNames = (await _roles.GetUserRolesAsync(userId.Value, ct)).Select(r => r.Name).ToList();
        var allowed = roleNames.Any(r => string.Equals(r, Services.RoleSeeder.PremiumRoleName, StringComparison.OrdinalIgnoreCase)
                                        || string.Equals(r, Services.RoleSeeder.AdminRoleName, StringComparison.OrdinalIgnoreCase));
        if (!allowed)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Save to folder is available on the Premium plan only.",
                code = "save_not_allowed"
            });
        }

        var message = await _db.ChatMessages
            .Include(m => m.Thread)
            .FirstOrDefaultAsync(m => m.Id == messageId, ct);
        if (message is null) return NotFound(new { error = "Message not found." });
        if (message.Thread is null || message.Thread.OwnerId != userId.Value)
            return NotFound(new { error = "Message not found." });

        var threadMessages = await _db.ChatMessages
            .Where(m => m.ThreadId == message.ThreadId && m.Role == "assistant" && m.CreatedAt <= message.CreatedAt)
            .OrderBy(m => m.CreatedAt)
            .AsNoTracking()
            .ToListAsync(ct);

        if (threadMessages.Count == 0)
            return BadRequest(new { error = "No assistant messages found to save." });

        var documentType = InferDocumentType(threadMessages.Last().Content);
        var sections = threadMessages.Select((m, i) => ((string Heading, string Body))($"Section {i + 1}", m.Content));

        var docxBytes = DocxBuilder.BuildFromText($"MyLaw Draft – {documentType}", sections);

        if (docxBytes.LongLength > MaxBytes)
        {
            return StatusCode(StatusCodes.Status413PayloadTooLarge, new
            {
                error = "File size exceeds limit (25MB). Please use the download option instead.",
                code = "file_too_large"
            });
        }

        var now = DateTime.UtcNow;
        var fileName = $"{documentType.Replace(" ", "_")} - {now:yyyyMMdd_HHmm}.docx";
        var tags = AutoTags(documentType).Take(2).ToArray();

        var doc = new SavedDocument
        {
            Id = Guid.NewGuid(),
            OwnerId = userId.Value,
            FileName = fileName,
            DocumentType = documentType,
            TagsCsv = string.Join(",", tags),
            EditedBy = "System",
            SizeBytes = docxBytes.LongLength,
            Content = docxBytes,
            CreatedAt = now,
            UpdatedAt = now,
            SourceMessageId = messageId,
            SourceThreadId = message.ThreadId
        };
        _db.SavedDocuments.Add(doc);
        await _db.SaveChangesAsync(ct);

        return Ok(new
        {
            id = doc.Id,
            fileName = doc.FileName,
            documentType,
            tags,
            editedBy = doc.EditedBy,
            sizeDisplay = FormatSize(doc.SizeBytes),
            lastModifiedAt = doc.UpdatedAt,
            message = "Your draft has been saved to your Content Management folder."
        });
    }

    [HttpGet("documents")]
    public async Task<IActionResult> ListDocuments([FromQuery] string? tag = null, CancellationToken ct = default)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var profile = await _profiles.GetProfileAsync(userId.Value, ct);
        var userEmail = profile?.Email ?? string.Empty;

        var ownedQuery = _db.SavedDocuments.Where(d => d.OwnerId == userId.Value);
        if (!string.IsNullOrWhiteSpace(tag))
        {
            var tagLower = tag.ToLowerInvariant();
            ownedQuery = ownedQuery.Where(d => d.TagsCsv.ToLower().Contains(tagLower));
        }

        var owned = await ownedQuery
            .OrderByDescending(d => d.UpdatedAt)
            .AsNoTracking()
            .ToListAsync(ct);

        var now = DateTime.UtcNow;
        var sharedQuery = _db.DocumentShares
            .Where(s => s.RecipientEmail == userEmail
                       && s.ExpiresAt > now
                       && s.RevokedAt == null);
        if (!string.IsNullOrWhiteSpace(tag))
        {
            var tagLower = tag.ToLowerInvariant();
            sharedQuery = sharedQuery.Where(s => s.Document!.TagsCsv.ToLower().Contains(tagLower));
        }

        var sharedWithMe = await sharedQuery
            .Include(s => s.Document)
            .AsNoTracking()
            .ToListAsync(ct);

        // Mark shares as seen
        var unseenIds = sharedWithMe.Where(s => s.SeenAt == null).Select(s => s.Id).ToList();
        if (unseenIds.Count > 0)
        {
            await _db.DocumentShares
                .Where(s => unseenIds.Contains(s.Id))
                .ExecuteUpdateAsync(u => u.SetProperty(x => x.SeenAt, now), ct);
        }

        var ownedRows = owned.Select(d => new
        {
            id = d.Id,
            fileName = d.FileName,
            documentType = d.DocumentType,
            tags = d.TagsCsv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            editedBy = d.EditedBy,
            sizeDisplay = FormatSize(d.SizeBytes),
            sizeBytes = d.SizeBytes,
            createdAt = d.CreatedAt,
            lastModifiedAt = d.UpdatedAt,
            source = d.Source,
            actions = new[] { "download", "rename", "delete", "share", "edit_tags" }
        });

        var sharedRows = sharedWithMe
            .Where(s => s.Document is not null)
            .Select(s => new
            {
                id = s.Document!.Id,
                fileName = s.Document.FileName,
                documentType = s.Document.DocumentType,
                tags = s.Document.TagsCsv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
                editedBy = s.SharedByEmail,
                sizeDisplay = FormatSize(s.Document.SizeBytes),
                sizeBytes = s.Document.SizeBytes,
                createdAt = s.CreatedAt,
                lastModifiedAt = s.Document.UpdatedAt > s.CreatedAt ? s.Document.UpdatedAt : s.CreatedAt,
                source = "shared",
                actions = new[] { "download" }
            });

        return Ok(ownedRows.Concat(sharedRows).OrderByDescending(x => x.lastModifiedAt));
    }

    [HttpPost("chat/messages/{messageId:guid}/download")]
    public async Task<IActionResult> DownloadDraft(Guid messageId, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var message = await _db.ChatMessages
            .Include(m => m.Thread)
            .FirstOrDefaultAsync(m => m.Id == messageId, ct);
        if (message is null) return NotFound(new { error = "Message not found." });
        if (message.Thread is null || message.Thread.OwnerId != userId.Value)
            return NotFound(new { error = "Message not found." });

        var threadMessages = await _db.ChatMessages
            .Where(m => m.ThreadId == message.ThreadId && m.Role == "assistant" && m.CreatedAt <= message.CreatedAt)
            .OrderBy(m => m.CreatedAt)
            .AsNoTracking()
            .ToListAsync(ct);

        if (threadMessages.Count == 0)
            return BadRequest(new { error = "No assistant messages found to download." });

        var documentType = InferDocumentType(threadMessages.Last().Content);
        var sections = threadMessages.Select((m, i) => ((string Heading, string Body))($"Section {i + 1}", m.Content));

        var docxBytes = DocxBuilder.BuildFromText($"MyLaw Draft – {documentType}", sections);
        var fileName = $"{documentType.Replace(" ", "_")} - {DateTime.UtcNow:yyyyMMdd_HHmm}.docx";

        return File(docxBytes,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            fileName);
    }

    [HttpGet("documents/{documentId:guid}/download")]
    public async Task<IActionResult> DownloadDocument(Guid documentId, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var doc = await _db.SavedDocuments.FirstOrDefaultAsync(d => d.Id == documentId, ct);
        if (doc is null) return NotFound(new { error = "Document not found." });

        var allowed = doc.OwnerId == userId.Value;
        if (!allowed)
        {
            var profile = await _profiles.GetProfileAsync(userId.Value, ct);
            var email = profile?.Email ?? string.Empty;
            var now = DateTime.UtcNow;
            allowed = await _db.DocumentShares.AnyAsync(s =>
                s.DocumentId == documentId
                && s.RecipientEmail == email
                && s.ExpiresAt > now
                && s.RevokedAt == null, ct);
        }
        if (!allowed) return NotFound(new { error = "Document not found." });

        var contentType = string.IsNullOrWhiteSpace(doc.ContentType)
            ? "application/octet-stream"
            : doc.ContentType;
        return File(doc.Content, contentType, doc.FileName);
    }

    [HttpPost("documents/upload")]
    // 5 files * 25 MB + multipart overhead ≈ 150 MB hard ceiling at Kestrel level.
    [RequestSizeLimit(150L * 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = 150L * 1024 * 1024)]
    public async Task<IActionResult> UploadDocuments(List<IFormFile> files, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        if (!await CanManageDriveAsync(userId.Value, ct))
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Document upload is available on the Premium plan only.",
                code = "upload_not_allowed"
            });

        var maxBatch = _config.GetValue<int?>("MyLaw:ContentManagement:MaxFilesPerBatch") ?? 5;
        if (files == null || files.Count == 0)
            return BadRequest(new { error = "No files provided." });
        if (files.Count > maxBatch)
            return BadRequest(new { error = $"You can only upload up to {maxBatch} files at once.", code = "batch_too_large" });

        var maxFileBytes = _config.GetValue<long?>("MyLaw:ContentManagement:MaxFileBytes") ?? 26214400L;
        var allowedExt = _config.GetSection("MyLaw:ContentManagement:AllowedExtensions").Get<string[]>()
            ?? new[] { ".pdf", ".doc", ".docx", ".txt" };
        var quotaBytes = _config.GetValue<long?>("MyLaw:ContentManagement:QuotaBytes") ?? 1073741824L;

        var currentUsage = await _db.SavedDocuments
            .Where(d => d.OwnerId == userId.Value)
            .SumAsync(d => (long?)d.SizeBytes, ct) ?? 0L;

        var profile = await _profiles.GetProfileAsync(userId.Value, ct);
        var ownerEmail = profile?.Email ?? "unknown";

        var saved = new List<object>();
        var totalNewBytes = 0L;
        foreach (var file in files)
        {
            var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!allowedExt.Contains(ext))
                return BadRequest(new { error = "This file type is not supported. Please upload a PDF, DOCX, or TXT file.", code = "unsupported_type", fileName = file.FileName });
            if (file.Length > maxFileBytes)
                return BadRequest(new { error = "This file is too large. The maximum file size allowed is 25MB.", code = "file_too_large", fileName = file.FileName });
            if (HasInvalidNameChars(file.FileName))
                return BadRequest(new { error = "File name cannot contain special characters.", code = "invalid_filename", fileName = file.FileName });
            if (currentUsage + totalNewBytes + file.Length > quotaBytes)
                return BadRequest(new { error = "You've reached your 1GB storage limit. Please delete unused files first.", code = "quota_exceeded" });

            var existsSameName = await _db.SavedDocuments
                .AnyAsync(d => d.OwnerId == userId.Value && d.FileName == file.FileName, ct);
            if (existsSameName)
                return Conflict(new { error = "This file already exists in your drive.", code = "duplicate_filename", fileName = file.FileName });

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms, ct);
            var rawBytes = ms.ToArray();

            string? anonNotice = null;
            int piiMatches = 0;
            var bytes = rawBytes;
            if (_uploadAnonymizer.Supports(ext))
            {
                var anonResult = _uploadAnonymizer.Anonymize(rawBytes, ext);
                bytes = anonResult.Bytes;
                piiMatches = anonResult.MatchCount;
                anonNotice = anonResult.Modified
                    ? "PII data has been anonymized."
                    : "No PII data found. Document uploaded without modification.";
            }

            var autoTag = await _classifier.ClassifyAsync(file.FileName, bytes, ct);
            var tagsCsv = autoTag is null ? string.Empty : autoTag;

            var doc = new SavedDocument
            {
                Id = Guid.NewGuid(),
                OwnerId = userId.Value,
                FileName = file.FileName,
                ContentType = file.ContentType,
                Source = "uploaded",
                DocumentType = ext.TrimStart('.').ToUpperInvariant(),
                TagsCsv = tagsCsv,
                EditedBy = ownerEmail,
                SizeBytes = bytes.LongLength,
                Content = bytes,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _db.SavedDocuments.Add(doc);
            totalNewBytes += bytes.LongLength;

            saved.Add(new
            {
                id = doc.Id,
                fileName = doc.FileName,
                contentType = doc.ContentType,
                sizeDisplay = FormatSize(doc.SizeBytes),
                createdAt = doc.CreatedAt,
                anonymization = anonNotice is null ? null : new
                {
                    notice = anonNotice,
                    piiMatchesRemoved = piiMatches
                }
            });

            try
            {
                await _activity.LogActivityAsync(
                    userId.Value,
                    DainnUser.Core.Enums.ActivityType.ProfileUpdate,
                    "Document uploaded; anonymization applied.",
                    ipAddress: HttpContext.Connection.RemoteIpAddress?.ToString() ?? string.Empty,
                    userAgent: Request.Headers.UserAgent.ToString() ?? string.Empty,
                    metadata: System.Text.Json.JsonSerializer.Serialize(new
                    {
                        action = "document_upload_anonymized",
                        documentId = doc.Id,
                        fileName = doc.FileName,
                        piiMatchesRemoved = piiMatches,
                        modified = anonNotice == "PII data has been anonymized.",
                        at = DateTime.UtcNow
                    }),
                    ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to audit upload anonymization for {File}", doc.FileName);
            }
        }

        await _db.SaveChangesAsync(ct);
        return Ok(new { uploaded = saved });
    }

    [HttpPatch("documents/{documentId:guid}")]
    public async Task<IActionResult> RenameDocument(Guid documentId, [FromBody] RenameDocumentRequest req, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(req.NewName))
            return BadRequest(new { error = "File name is required." });
        if (HasInvalidNameChars(req.NewName))
            return BadRequest(new { error = "File name cannot contain special characters.", code = "invalid_filename" });

        var doc = await _db.SavedDocuments
            .FirstOrDefaultAsync(d => d.Id == documentId && d.OwnerId == userId.Value, ct);
        if (doc is null) return NotFound(new { error = "Document not found." });

        var duplicate = await _db.SavedDocuments
            .AnyAsync(d => d.OwnerId == userId.Value && d.Id != documentId && d.FileName == req.NewName, ct);
        if (duplicate)
            return Conflict(new { error = "This file already exists in your drive.", code = "duplicate_filename" });

        var profile = await _profiles.GetProfileAsync(userId.Value, ct);
        doc.FileName = req.NewName;
        doc.EditedBy = profile?.Email ?? "unknown";
        doc.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        return Ok(new
        {
            id = doc.Id,
            fileName = doc.FileName,
            editedBy = doc.EditedBy,
            lastModifiedAt = doc.UpdatedAt,
            message = "File name updated successfully"
        });
    }

    [HttpPost("documents/{documentId:guid}/share")]
    public async Task<IActionResult> ShareDocument(Guid documentId, [FromBody] ShareDocumentRequest req, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        if (!await CanManageDriveAsync(userId.Value, ct))
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Document sharing is available on the Premium plan only.",
                code = "share_not_allowed"
            });

        var doc = await _db.SavedDocuments
            .FirstOrDefaultAsync(d => d.Id == documentId && d.OwnerId == userId.Value, ct);
        if (doc is null) return NotFound(new { error = "Document not found." });

        if (req.Emails is null || req.Emails.Count == 0)
            return BadRequest(new { error = "At least one email is required." });
        if (req.Emails.Count > 5)
            return BadRequest(new { error = "You can share with at most 5 recipients per request.", code = "too_many_recipients" });

        var emailAttr = new System.ComponentModel.DataAnnotations.EmailAddressAttribute();
        var invalid = req.Emails.Where(e => !emailAttr.IsValid(e)).ToList();
        if (invalid.Count > 0)
            return BadRequest(new { error = $"Invalid email format: {string.Join(", ", invalid)}", code = "invalid_email" });

        var normalized = req.Emails
            .Select(e => e.Trim().ToLowerInvariant())
            .Distinct()
            .ToList();

        var sharerProfile = await _profiles.GetProfileAsync(userId.Value, ct);
        var sharerEmail = sharerProfile?.Email ?? "unknown";
        var sharerName = sharerProfile?.DisplayName ?? sharerEmail;

        var now = DateTime.UtcNow;
        var expiresAt = now.AddDays(7);
        var baseUrl = _config.GetValue<string>("MyLaw:DriveSharedUrlBase") ?? "https://mylaw.ai/shared";

        var sharesCreated = new List<object>();
        foreach (var recipient in normalized)
        {
            var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
            var share = new DocumentShare
            {
                Id = Guid.NewGuid(),
                DocumentId = documentId,
                SharedByUserId = userId.Value,
                SharedByEmail = sharerEmail,
                RecipientEmail = recipient,
                Token = token,
                CreatedAt = now,
                ExpiresAt = expiresAt
            };
            _db.DocumentShares.Add(share);

            try
            {
                await SendShareEmailAsync(recipient, sharerEmail, doc.FileName, $"{baseUrl}/{token}", now, ct);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send share email to {Recipient}", recipient);
            }

            sharesCreated.Add(new { recipient, expiresAt });
        }

        await _db.SaveChangesAsync(ct);
        return Ok(new { shares = sharesCreated });
    }

    [HttpGet("documents/share-status")]
    public async Task<IActionResult> ShareStatus(CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var profile = await _profiles.GetProfileAsync(userId.Value, ct);
        var email = profile?.Email ?? string.Empty;
        var now = DateTime.UtcNow;

        var unseen = await _db.DocumentShares.CountAsync(s =>
            s.RecipientEmail == email
            && s.ExpiresAt > now
            && s.RevokedAt == null
            && s.SeenAt == null, ct);

        return Ok(new { unseenCount = unseen, hasUnseen = unseen > 0 });
    }

    private async Task SendShareEmailAsync(
        string recipient,
        string sharerEmail,
        string fileName,
        string accessUrl,
        DateTime sharedAt,
        CancellationToken ct)
    {
        var safeRecipient = WebUtility.HtmlEncode(recipient);
        var safeSharer = WebUtility.HtmlEncode(sharerEmail);
        var safeFile = WebUtility.HtmlEncode(fileName);
        var safeUrl = WebUtility.HtmlEncode(accessUrl);

        var body = $"""
            <p>Hi {safeRecipient},</p>
            <p>{safeSharer} has shared a legal document with you via the MyLaw platform.</p>
            <p>You can access and download the file securely by clicking the link below:</p>
            <p><a href="{safeUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Access Document</a></p>
            <p>This link will remain active for 7 days. For your security, you will need to log in or authenticate your email before accessing the document.</p>
            <p><strong>Shared File Name:</strong> {safeFile}<br/>
               <strong>Shared By:</strong> {safeSharer}<br/>
               <strong>Shared Date:</strong> {sharedAt:yyyy-MM-dd HH:mm} UTC</p>
            <p>If you believe this email was sent to you by mistake, you can safely ignore it.</p>
            <p>Thank you,<br/>The MyLaw Team</p>
            """;

        await _email.SendEmailAsync(
            recipient, recipient,
            "[MyLaw] You've been invited to access a shared document",
            body,
            Array.Empty<EmailAttachment>(),
            ct);
    }

    [HttpPut("documents/{documentId:guid}/tags")]
    public async Task<IActionResult> UpdateTags(Guid documentId, [FromBody] UpdateTagsRequest req, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        if (!await CanManageDriveAsync(userId.Value, ct))
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Tag management is available on the Premium plan only.",
                code = "tag_edit_not_allowed"
            });

        var maxTags = _config.GetValue<int?>("MyLaw:ContentManagement:MaxTagsPerDocument") ?? 2;
        if (req.Tags.Count > maxTags)
            return BadRequest(new { error = $"A document can have at most {maxTags} tags.", code = "too_many_tags" });

        var allowed = _config.GetSection("MyLaw:ContentManagement:ClassificationKeywords")
            .GetChildren()
            .Select(s => s.Key)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var invalid = req.Tags.Where(t => !allowed.Contains(t)).ToList();
        if (invalid.Count > 0)
            return BadRequest(new { error = $"Invalid tags: {string.Join(", ", invalid)}. Choose from the predefined list.", code = "invalid_tags" });

        var doc = await _db.SavedDocuments
            .FirstOrDefaultAsync(d => d.Id == documentId && d.OwnerId == userId.Value, ct);
        if (doc is null) return NotFound(new { error = "Document not found." });

        var profile = await _profiles.GetProfileAsync(userId.Value, ct);
        var normalized = req.Tags.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        doc.TagsCsv = string.Join(",", normalized);
        doc.EditedBy = profile?.Email ?? "unknown";
        doc.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        return Ok(new
        {
            id = doc.Id,
            tags = normalized,
            editedBy = doc.EditedBy,
            lastModifiedAt = doc.UpdatedAt
        });
    }

    [HttpDelete("documents/{documentId:guid}")]
    public async Task<IActionResult> DeleteDocument(Guid documentId, CancellationToken ct)
    {
        var userId = CurrentUserId;
        if (userId is null) return Unauthorized();

        var rows = await _db.SavedDocuments
            .Where(d => d.Id == documentId && d.OwnerId == userId.Value)
            .ExecuteDeleteAsync(ct);

        if (rows == 0) return NotFound(new { error = "Document not found." });
        return NoContent();
    }

    private static bool HasInvalidNameChars(string name)
    {
        char[] invalid = { '/', '\\', ':', '*', '?', '"', '<', '>', '|' };
        return name.IndexOfAny(invalid) >= 0;
    }

    private static string InferDocumentType(string content)
    {
        var lower = content.ToLowerInvariant();
        if (lower.Contains("freelance contract") || lower.Contains("independent contractor")) return "Freelance Contract";
        if (lower.Contains("employment contract") || lower.Contains("employment agreement")) return "Employment Contract";
        if (lower.Contains("nda") || lower.Contains("non-disclosure")) return "NDA";
        if (lower.Contains("service agreement") || lower.Contains("services agreement")) return "Services Agreement";
        if (lower.Contains("lease") || lower.Contains("rental")) return "Lease Agreement";
        return "Legal Draft";
    }

    private static IEnumerable<string> AutoTags(string documentType)
    {
        yield return documentType;
        if (documentType.Contains("Freelance", StringComparison.OrdinalIgnoreCase)) yield return "Freelance";
        else if (documentType.Contains("Employment", StringComparison.OrdinalIgnoreCase)) yield return "Employment";
        else if (documentType.Contains("NDA", StringComparison.OrdinalIgnoreCase)) yield return "Confidentiality";
        else yield return "Contract";
    }

    private static string FormatSize(long bytes)
    {
        if (bytes >= 1024 * 1024)
            return ((double)bytes / (1024 * 1024)).ToString("0.00", CultureInfo.InvariantCulture) + " MB";
        return ((double)bytes / 1024).ToString("0.00", CultureInfo.InvariantCulture) + " KB";
    }
}
