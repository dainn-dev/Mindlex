using System.ComponentModel.DataAnnotations;

namespace Mindlex.Validation;

[AttributeUsage(AttributeTargets.Property)]
public sealed class PasswordComplexityAttribute : ValidationAttribute
{
    private const int MinLength = 8;
    private static readonly char[] SpecialChars = "@#!$%^&*".ToCharArray();

    protected override ValidationResult? IsValid(object? value, ValidationContext ctx)
    {
        if (value is not string s || string.IsNullOrEmpty(s))
            return ValidationResult.Success;

        var member = new[] { ctx.MemberName ?? string.Empty };

        if (s.Length < MinLength)
            return new ValidationResult("Password must be at least 8 characters long.", member);

        if (!s.Any(char.IsDigit))
            return new ValidationResult("Password must include at least one number.", member);

        if (!s.Any(char.IsUpper))
            return new ValidationResult("Password must include at least one uppercase letter.", member);

        if (!s.Any(c => Array.IndexOf(SpecialChars, c) >= 0))
            return new ValidationResult(
                "Password must include at least one special character including @, #, !, $, %, ^, &, *",
                member);

        return ValidationResult.Success;
    }
}
