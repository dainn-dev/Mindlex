using System.ComponentModel.DataAnnotations;
using Mindlex.Validation;

namespace Mindlex.Models;

public class SocialSignInRequest
{
    [Required(ErrorMessage = "Authorization code is required.")]
    [StringLength(4096, MinimumLength = 1)]
    public string Code { get; set; } = string.Empty;

    [Required(ErrorMessage = "Callback URL is required.")]
    [Url(ErrorMessage = "Callback URL must be a valid absolute URL.")]
    [StringLength(2048)]
    public string CallbackUrl { get; set; } = string.Empty;
}

public class CompleteSocialSignupRequest
{
    [Required(ErrorMessage = "Please enter your Date of Birth")]
    [MinimumAge(18)]
    public DateTime? DateOfBirth { get; set; }

    [MustBeTrue(ErrorMessage = "You must accept the Terms and Conditions to proceed.")]
    public bool AcceptedTerms { get; set; }

    [MustBeTrue(ErrorMessage = "You must accept the Privacy Policy to proceed.")]
    public bool AcceptedPrivacy { get; set; }
}
