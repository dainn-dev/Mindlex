using System.ComponentModel.DataAnnotations;

namespace Mindlex.Controllers;

public class RenameDocumentRequest
{
    [Required(ErrorMessage = "File name is required.")]
    [StringLength(255, MinimumLength = 1, ErrorMessage = "File name must be 1\u2013255 characters.")]
    public string NewName { get; set; } = string.Empty;
}

public class ShareDocumentRequest
{
    [Required(ErrorMessage = "At least one email is required.")]
    [MinLength(1, ErrorMessage = "At least one email is required.")]
    [MaxLength(5, ErrorMessage = "You can share with at most 5 recipients per request.")]
    public List<string> Emails { get; set; } = new();
}

public class UpdateTagsRequest
{
    [Required]
    [MaxLength(5, ErrorMessage = "Too many tags supplied.")]
    public List<string> Tags { get; set; } = new();
}
