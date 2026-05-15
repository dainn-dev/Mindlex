using System.ComponentModel.DataAnnotations;
using Mindlex.Services;

namespace Mindlex.Models;

public class ChangeUserRoleRequest
{
    [Required(ErrorMessage = "Role is required.")]
    [AllowedValues(RoleSeeder.FreeRoleName, RoleSeeder.PlusRoleName, RoleSeeder.PremiumRoleName,
        ErrorMessage = "Role must be one of: Free, Plus, Premium.")]
    public string Role { get; set; } = string.Empty;

    [Required(ErrorMessage = "Reason is required.")]
    [StringLength(5000, ErrorMessage = "Reason must be at most 5000 characters.")]
    public string Reason { get; set; } = string.Empty;
}
