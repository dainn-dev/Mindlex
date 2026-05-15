using System.ComponentModel.DataAnnotations;
using Mindlex.Validation;

namespace Mindlex.Models;

public class RegisterRequest
{
    [Required(ErrorMessage = "Full name is required.")]
    [StringLength(50, ErrorMessage = "The full name must not exceed 50 characters")]
    public string FullName { get; set; } = string.Empty;

    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Please enter a valid email address.")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Password is required.")]
    [PasswordComplexity]
    public string Password { get; set; } = string.Empty;

    [Required(ErrorMessage = "Please confirm your password.")]
    [Compare(nameof(Password), ErrorMessage = "Passwords do not match.")]
    public string ConfirmPassword { get; set; } = string.Empty;

    [Required(ErrorMessage = "Please enter your Date of Birth")]
    [MinimumAge(18)]
    public DateTime? DateOfBirth { get; set; }

    [MustBeTrue(ErrorMessage = "You must accept the Terms and Conditions to proceed.")]
    public bool AcceptedTerms { get; set; }

    [MustBeTrue(ErrorMessage = "You must accept the Privacy Policy to proceed.")]
    public bool AcceptedPrivacy { get; set; }
}

public class LoginRequest
{
    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Please enter a valid email address.")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Password is required.")]
    public string Password { get; set; } = string.Empty;

    public bool RememberMe { get; set; }
}

public record RefreshTokenRequest(string RefreshToken);

public class ForgotPasswordRequest
{
    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Please enter a valid email address.")]
    public string Email { get; set; } = string.Empty;
}

public class ResetPasswordRequest
{
    [Required(ErrorMessage = "Reset token is required.")]
    public string Token { get; set; } = string.Empty;

    [Required(ErrorMessage = "Password is required.")]
    [PasswordComplexity]
    public string NewPassword { get; set; } = string.Empty;

    [Required(ErrorMessage = "Please confirm your password.")]
    [Compare(nameof(NewPassword), ErrorMessage = "Passwords do not match.")]
    public string ConfirmPassword { get; set; } = string.Empty;
}

public record VerifyEmailRequest(Guid UserId, string Token);
