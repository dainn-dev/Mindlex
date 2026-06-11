using System.ComponentModel.DataAnnotations;

namespace MyLaw.Models;

public class SaveTopicsRequest
{
    [Required]
    public List<string> Topics { get; set; } = new();
}
