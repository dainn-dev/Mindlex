// UM4 + UM5 + UM15 — reused on Homepage and LoginPage
import { FormEvent, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { apiError } from "@/lib/api";
import { validators } from "@/lib/utils";

export function LoginForm({ embedded }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);
  const showToast = useUiStore((s) => s.showToast);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!email) errs.email = "Email is required";
    else if (!validators.email(email)) errs.email = "Enter a valid email address.";
    if (!password) errs.password = "Password is required";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true); setBanner(null);
    try {
      const user = await login(email, password, remember);
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname;
      navigate(from ?? (user.onboardingCompleted ? "/chatbot" : "/onboarding"));
    } catch (err) {
      setBanner(apiError(err) || "Invalid email or password.");
      showToast("danger", "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      {banner && <ErrorBanner message={banner} />}
      <Input
        name="email"
        type="email"
        label="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        autoComplete="email"
      />
      <Input
        name="password"
        type="password"
        label="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={errors.password}
        autoComplete="current-password"
      />
      <div className="flex items-center justify-between mb-4 text-sm">
        <label className="flex items-center gap-2 text-slate-600">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          Remember me
        </label>
        <Link to="/forgot-password" className="text-navy hover:underline">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" full disabled={busy}>
        {busy ? "Signing in..." : "Sign in"}
      </Button>
      {!embedded && (
        <p className="text-center text-sm text-slate-500 mt-4">
          New here?{" "}
          <Link to="/register" className="text-navy font-semibold">
            Create an account
          </Link>
        </p>
      )}
      <Divider text="or continue with" />
      <div className="grid grid-cols-2 gap-2.5">
        <SocialButton provider="google" />
        <SocialButton provider="microsoft" />
      </div>
    </form>
  );
}

function Divider({ text }: { text: string }) {
  return (
    <div className="my-4 text-center text-xs text-slate-400 relative">
      <span className="bg-white relative z-10 px-2">{text}</span>
      <span className="absolute top-1/2 left-0 right-0 h-px bg-slate-200 -z-0" />
    </div>
  );
}

function SocialButton({ provider }: { provider: "google" | "microsoft" }) {
  const label = provider === "google" ? "Google" : "Microsoft";
  const onClick = () => {
    const clientId = import.meta.env.VITE_OAUTH_CLIENT_ID ?? "demo";
    window.location.href = `/api/auth/oauth/${provider}/redirect?client_id=${clientId}`;
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-2 border border-slate-200 bg-white rounded-md py-2 text-sm hover:bg-slate-50"
    >
      {provider === "google" ? "🟦" : "🟧"} {label}
    </button>
  );
}
