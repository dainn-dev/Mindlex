using System.ComponentModel.DataAnnotations;

namespace Mindlex.Controllers;

public class RenameDocumentRequest
{
    [Required(ErrorMessage = "File name is required.")]
    [StringLength(255, ErrorMessage = "File name is too long.")]
    public string NewName { get; set; } = string.Empty;
}

public class ShareDocumentRequest
{
    [Required(ErrorMessage = "At least one email is required.")]
    public List<string> Emails { get; set; } = new();
}

public class UpdateTagsRequest
{
    [Required]
    public List<string> Tags { get; set; } = new();
}
