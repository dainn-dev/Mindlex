using System.ComponentModel.DataAnnotations;

namespace MyLaw.Validation;

[AttributeUsage(AttributeTargets.Property)]
public sealed class MinimumAgeAttribute : ValidationAttribute
{
    public int Years { get; }

    public MinimumAgeAttribute(int years)
    {
        Years = years;
    }

    protected override ValidationResult? IsValid(object? value, ValidationContext ctx)
    {
        if (value is null) return ValidationResult.Success;
        if (value is not DateTime dob) return ValidationResult.Success;

        var today = DateTime.UtcNow.Date;
        var age = today.Year - dob.Year;
        if (dob.Date > today.AddYears(-age)) age--;

        return age >= Years
            ? ValidationResult.Success
            : new ValidationResult(
                $"You must be at least {Years} years old to register for a MyLaw Account.",
                new[] { ctx.MemberName ?? string.Empty });
    }
}
