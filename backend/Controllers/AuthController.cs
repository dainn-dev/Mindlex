using DainnUser.Core.Exceptions;
using DainnUser.Core.Interfaces.Services;
using DainnUser.Core.Models.Profile;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Caching.Memory;
using MyLaw.Models;
using MyLaw.Services;

namespace MyLaw.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private static readonly TimeSpan ResendCooldown = TimeSpan.FromSeconds(60);

    private readonly IAuthenticationService _auth;
    private readonly IProfileService _profiles;
    private readonly IRoleService _roles;
    private readonly ISocialLoginService _social;
    private readonly IMemoryCache _cache;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IAuthenticationService auth,
        IProfileService profiles,
        IRoleService roles,
        ISocialLoginService social,
        IMemoryCache cache,
        ILogger<AuthController> logger)
    {
        _auth = auth;
        _profiles = profiles;
        _roles = roles;
        _social = social;
        _cache = cache;
        _logger = logger;
    }

    private string? ClientIp => HttpContext.Connection.RemoteIpAddress?.ToString();
    private string? UserAgent => Request.Headers.UserAgent.ToString();

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest req, CancellationToken ct)
    {
        Guid userId;
        try
        {
            userId = await _auth.RegisterAsync(req.Email, req.Email, req.Password, ct);
        }
        catch (Exception ex) when (IsDuplicateAccountError(ex))
        {
            return Conflict(new { error = "Email is already registered." });
        }

        try
        {
            await _profiles.UpdateProfileAsync(userId, new UpdateProfileDto
            {
                DisplayName = req.FullName,
                DateOfBirth = req.DateOfBirth
            }, ct);

            var allRoles = await _roles.GetAllRolesAsync(ct);
            var freeRole = allRoles.FirstOrDefault(r =>
                string.Equals(r.Name, RoleSeeder.FreeRoleName, StringComparison.OrdinalIgnoreCase));
            if (freeRole is null)
            {
                _logger.LogWarning("Free role missing at registration time — seeder did not run.");
            }
            else
            {
                await _roles.AssignRoleToUserAsync(userId, freeRole.Id, ct);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Post-registration setup failed for user {UserId}", userId);
        }

        return CreatedAtAction(nameof(Register), new { id = userId }, new
        {
            userId,
            role = RoleSeeder.FreeRoleName,
            emailVerificationRequired = true,
            message = "Account created. Please check your email to verify your account before logging in."
        });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req, CancellationToken ct)
    {
        try
        {
            var result = await _auth.LoginAsync(
                req.Email,
                req.Password,
                ClientIp ?? string.Empty,
                UserAgent ?? string.Empty,
                string.Empty,
                ct);

            return Ok(new
            {
                accessToken = result.AccessToken,
                refreshToken = result.RefreshToken,
                accessTokenExpiresAt = result.AccessTokenExpiresAt,
                refreshTokenExpiresAt = result.RefreshTokenExpiresAt,
                sessionId = result.SessionId,
                user = result.User,
                requiresTwoFactor = result.RequiresTwoFactor,
                rememberMe = req.RememberMe
            });
        }
        catch (InvalidCredentialsException)
        {
            return Unauthorized(new { error = "Invalid email or password." });
        }
        catch (AccountLockedException)
        {
            return Unauthorized(new { error = "Invalid email or password." });
        }
        catch (EmailNotVerifiedException)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Please verify your email address before logging in.",
                code = "email_not_verified",
                emailVerificationRequired = true
            });
        }
        catch (AccountInactiveException)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new
            {
                error = "Your account is currently inactive. Please contact support.",
                code = "account_inactive"
            });
        }
    }

    [HttpPost("oauth/google")]
    [AllowAnonymous]
    public async Task<IActionResult> OAuthGoogle([FromBody] SocialSignInRequest req, CancellationToken ct)
    {
        return await HandleSocialSignIn(
            () => _social.LoginWithGoogleAsync(req.Code, req.CallbackUrl, ClientIp ?? string.Empty, UserAgent ?? string.Empty, ct),
            "google",
            ct);
    }

    [HttpPost("oauth/microsoft")]
    [AllowAnonymous]
    public async Task<IActionResult> OAuthMicrosoft([FromBody] SocialSignInRequest req, CancellationToken ct)
    {
        return await HandleSocialSignIn(
            () => _social.LoginWithMicrosoftAsync(req.Code, req.CallbackUrl, ClientIp ?? string.Empty, UserAgent ?? string.Empty, ct),
            "microsoft",
            ct);
    }

    [HttpPost("oauth/complete-profile")]
    [Authorize]
    public async Task<IActionResult> CompleteSocialProfile(
        [FromBody] CompleteSocialSignupRequest req,
        CancellationToken ct)
    {
        var sub = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
            ?? User.FindFirst("sub")?.Value;
        if (!Guid.TryParse(sub, out var userId)) return Unauthorized();

        await _profiles.UpdateProfileAsync(userId, new UpdateProfileDto
        {
            DateOfBirth = req.DateOfBirth
        }, ct);

        try
        {
            var allRoles = await _roles.GetAllRolesAsync(ct);
            var freeRole = allRoles.FirstOrDefault(r =>
                string.Equals(r.Name, RoleSeeder.FreeRoleName, StringComparison.OrdinalIgnoreCase));
            if (freeRole is not null)
            {
                await _roles.AssignRoleToUserAsync(userId, freeRole.Id, ct);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to ensure Free role for user {UserId} during social-profile completion", userId);
        }

        return Ok(new
        {
            message = "Profile completed. You now have full access.",
            profileCompletionRequired = false
        });
    }

    private async Task<IActionResult> HandleSocialSignIn(
        Func<Task<DainnUser.Core.Models.Authentication.LoginResult>> loginCall,
        string provider,
        CancellationToken ct)
    {
        DainnUser.Core.Models.Authentication.LoginResult result;
        try
        {
            result = await loginCall();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Social sign-in failed for provider {Provider}", provider);
            return BadRequest(new
            {
                error = "Social sign-in failed. Please try again.",
                code = "social_signin_failed",
                provider
            });
        }

        var profile = await _profiles.GetProfileAsync(result.User.Id, ct);
        var profileCompletionRequired = profile?.DateOfBirth is null;

        return Ok(new
        {
            accessToken = result.AccessToken,
            refreshToken = result.RefreshToken,
            accessTokenExpiresAt = result.AccessTokenExpiresAt,
            refreshTokenExpiresAt = result.RefreshTokenExpiresAt,
            sessionId = result.SessionId,
            user = result.User,
            provider,
            profileCompletionRequired,
            nextStep = profileCompletionRequired
                ? "POST /api/auth/oauth/complete-profile with dateOfBirth + T&C consent"
                : null
        });
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshTokenRequest req, CancellationToken ct)
    {
        var result = await _auth.RefreshTokenAsync(req.RefreshToken, ClientIp ?? string.Empty, UserAgent ?? string.Empty, ct);
        return Ok(result);
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        var sidClaim = User.FindFirst("sid")?.Value;
        if (string.IsNullOrEmpty(sidClaim) || !Guid.TryParse(sidClaim, out var sid))
            return BadRequest(new { error = "Missing session id" });

        await _auth.LogoutAsync(sid, ct);
        return NoContent();
    }

    [HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest req, CancellationToken ct)
    {
        await _auth.ForgotPasswordAsync(req.Email, ct);

        return Accepted(new
        {
            message = "If you are registered in the platform please check your email."
        });
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest req, CancellationToken ct)
    {
        try
        {
            await _auth.ResetPasswordAsync(req.Token, req.NewPassword, ct);
        }
        catch (InvalidPasswordResetTokenException)
        {
            return BadRequest(new
            {
                error = "This reset link is invalid or has expired.",
                code = "invalid_or_expired_token"
            });
        }

        return Ok(new
        {
            message = "Your password has been successfully reset. You can now log in with your new credentials."
        });
    }

    [HttpPost("verify-email")]
    public async Task<IActionResult> VerifyEmail([FromBody] VerifyEmailRequest req, CancellationToken ct)
    {
        var ok = await _auth.VerifyEmailAsync(req.UserId, req.Token, ct);
        if (!ok)
        {
            return BadRequest(new
            {
                error = "This verification link has expired. Please request a new one.",
                canResend = true
            });
        }

        return Ok(new
        {
            verified = true,
            userId = req.UserId,
            message = "Email verified successfully."
        });
    }

    [HttpPost("resend-verification")]
    public async Task<IActionResult> ResendVerification([FromBody] ForgotPasswordRequest req, CancellationToken ct)
    {
        var cacheKey = $"resend-verify:{req.Email.Trim().ToLowerInvariant()}";
        if (_cache.TryGetValue<DateTime>(cacheKey, out var lastSentAt))
        {
            var elapsed = DateTime.UtcNow - lastSentAt;
            if (elapsed < ResendCooldown)
            {
                var retryAfter = (int)Math.Ceiling((ResendCooldown - elapsed).TotalSeconds);
                Response.Headers["Retry-After"] = retryAfter.ToString();
                return StatusCode(StatusCodes.Status429TooManyRequests, new
                {
                    error = $"Please wait {retryAfter} seconds before requesting another verification email.",
                    retryAfterSeconds = retryAfter
                });
            }
        }

        var ok = await _auth.ResendVerificationEmailAsync(req.Email, ct);
        if (!ok)
        {
            return Accepted(new { message = "If an account exists for this email, a verification message has been sent." });
        }

        _cache.Set(cacheKey, DateTime.UtcNow, ResendCooldown);
        return Accepted(new { message = "Verification email sent. Check your inbox." });
    }

    private static bool IsDuplicateAccountError(Exception ex)
    {
        var msg = ex.Message ?? string.Empty;
        return msg.Contains("already exists", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("already in use", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("duplicate", StringComparison.OrdinalIgnoreCase)
            || msg.Contains("taken", StringComparison.OrdinalIgnoreCase);
    }
}
