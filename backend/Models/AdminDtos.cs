using System.ComponentModel.DataAnnotations;
using MyLaw.Services;

namespace MyLaw.Models;

public class ChangeUserRoleRequest
{
    [Required(ErrorMessage = "Role is required.")]
    [AllowedValues(RoleSeeder.FreeRoleName, RoleSeeder.PlusRoleName, RoleSeeder.PremiumRoleName,
        ErrorMessage = "Role must be one of: Free, Plus, Premium.")]
    public string Role { get; set; } = string.Empty;

    [Required(ErrorMessage = "Reason is required.")]
    [StringLength(5000, MinimumLength = 1, ErrorMessage = "Reason must be 1\u20135000 characters.")]
    public string Reason { get; set; } = string.Empty;
}
