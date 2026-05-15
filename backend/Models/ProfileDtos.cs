using System.ComponentModel.DataAnnotations;
using Mindlex.Validation;

namespace Mindlex.Models;

public class UpdateFullNameRequest
{
    [Required(ErrorMessage = "Full name is required.")]
    [StringLength(50, ErrorMessage = "The full name must not exceed 50 characters")]
    public string FullName { get; set; } = string.Empty;
}

public class ChangePasswordRequest
{
    [Required(ErrorMessage = "Current password is required.")]
    public string CurrentPassword { get; set; } = string.Empty;

    [Required(ErrorMessage = "Password is required.")]
    [PasswordComplexity]
    public string NewPassword { get; set; } = string.Empty;

    [Required(ErrorMessage = "Please confirm your password.")]
    [Compare(nameof(NewPassword), ErrorMessage = "Passwords do not match.")]
    public string ConfirmNewPassword { get; set; } = string.Empty;
}
