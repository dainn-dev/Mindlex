using System.ComponentModel.DataAnnotations;

namespace Mindlex.Validation;

[AttributeUsage(AttributeTargets.Property)]
public sealed class MustBeTrueAttribute : ValidationAttribute
{
    protected override ValidationResult? IsValid(object? value, ValidationContext ctx)
    {
        if (value is bool b && b)
            return ValidationResult.Success;

        return new ValidationResult(
            ErrorMessage ?? "This must be accepted to continue.",
            new[] { ctx.MemberName ?? string.Empty });
    }
}
