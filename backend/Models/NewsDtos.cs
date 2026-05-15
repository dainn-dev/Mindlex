using System.ComponentModel.DataAnnotations;

namespace Mindlex.Models;

public class SaveTopicsRequest
{
    [Required]
    public List<string> Topics { get; set; } = new();
}
