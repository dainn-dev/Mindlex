using System.ComponentModel.DataAnnotations;
using MyLaw.Validation;

namespace MyLaw.Models;

public class RegisterRequest
{
    [Required(ErrorMessage = "Full name is required.")]
    [StringLength(50, ErrorMessage = "The full name must not exceed 50 characters")]
    public string FullName { get; set; } = string.Empty;

    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Please enter a valid email address.")]
    [StringLength(254, ErrorMessage = "Email is too long.")]
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
    [StringLength(254)]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Password is required.")]
    [StringLength(256, MinimumLength = 1)]
    public string Password { get; set; } = string.Empty;

    public bool RememberMe { get; set; }
}

public class RefreshTokenRequest
{
    [Required(ErrorMessage = "Refresh token is required.")]
    [StringLength(2048, MinimumLength = 16, ErrorMessage = "Refresh token has invalid length.")]
    public string RefreshToken { get; set; } = string.Empty;
}

public class ForgotPasswordRequest
{
    [Required(ErrorMessage = "Email is required.")]
    [EmailAddress(ErrorMessage = "Please enter a valid email address.")]
    [StringLength(254)]
    public string Email { get; set; } = string.Empty;
}

public class ResetPasswordRequest
{
    [Required(ErrorMessage = "Reset token is required.")]
    [StringLength(1024, MinimumLength = 16)]
    public string Token { get; set; } = string.Empty;

    [Required(ErrorMessage = "Password is required.")]
    [PasswordComplexity]
    public string NewPassword { get; set; } = string.Empty;

    [Required(ErrorMessage = "Please confirm your password.")]
    [Compare(nameof(NewPassword), ErrorMessage = "Passwords do not match.")]
    public string ConfirmPassword { get; set; } = string.Empty;
}

public class VerifyEmailRequest
{
    [Required(ErrorMessage = "User id is required.")]
    public Guid UserId { get; set; }

    [Required(ErrorMessage = "Token is required.")]
    [StringLength(1024, MinimumLength = 16)]
    public string Token { get; set; } = string.Empty;
}
