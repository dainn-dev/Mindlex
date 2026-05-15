using System.ComponentModel.DataAnnotations;

namespace Mindlex.Models;

public class ChatMessageRequest
{
    [Required(ErrorMessage = "Message is required.")]
    [StringLength(8000, ErrorMessage = "Message is too long.")]
    public string Message { get; set; } = string.Empty;

    public Guid? ThreadId { get; set; }

    [AllowedValues("qa", "drafting", ErrorMessage = "Mode must be 'qa' or 'drafting'.")]
    public string Mode { get; set; } = "qa";

    public List<ChatHistoryEntry> History { get; set; } = new();
}

public class RenameThreadRequest
{
    [Required(ErrorMessage = "Please enter a thread name.")]
    [StringLength(30, ErrorMessage = "Thread name cannot exceed 30 characters.")]
    public string Title { get; set; } = string.Empty;
}

public sealed class ChatHistoryEntry
{
    [Required]
    public string Role { get; set; } = string.Empty;

    [Required]
    [StringLength(8000)]
    public string Content { get; set; } = string.Empty;
}

public class ChatFeedbackRequest
{
    [Required(ErrorMessage = "Message ID is required.")]
    public Guid MessageId { get; set; }

    [Required(ErrorMessage = "Feedback type is required.")]
    [AllowedValues("like", "dislike", ErrorMessage = "Type must be 'like' or 'dislike'.")]
    public string Type { get; set; } = string.Empty;
}

public class SetTonePreferenceRequest
{
    [Required(ErrorMessage = "Tone is required.")]
    [AllowedValues("plain", "technical", ErrorMessage = "Tone must be 'plain' or 'technical'.")]
    public string Tone { get; set; } = string.Empty;
}

public sealed class ChatSource
{
    public string Type { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string? Url { get; set; }
}
