// UM6 (part 2) — Reset password from email link
import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { api, apiError } from "@/lib/api";
import { useUiStore } from "@/store/uiStore";
import { validators } from "@/lib/utils";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const showToast = useUiStore((s) => s.showToast);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errs, setErrs] = useState<{ p?: string; c?: string }>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const x: typeof errs = {};
    if (!validators.password(password))
      x.p = "Must be at least 8 chars with 1 number and 1 symbol.";
    if (password !== confirm) x.c = "Passwords do not match.";
    setErrs(x);
    if (Object.keys(x).length) return;

    setBusy(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      showToast("success", "Your password has been reset.");
      navigate("/login");
    } catch (e2) {
      setBanner(apiError(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-navy to-navy-600">
      <div className="bg-white rounded-2xl p-9 w-full max-w-md shadow-lift">
        <h2 className="font-display text-2xl text-navy text-center">Set a new password</h2>
        <p className="text-center text-slate-500 text-sm mb-5">
          Pick a strong password you haven't used before.
        </p>
        {banner && <ErrorBanner message={banner} />}
        <form onSubmit={submit} noValidate>
          <Input label="New password" type="password" name="password"
            value={password} onChange={(e) => setPassword(e.target.value)} error={errs.p} />
          <div className="text-xs text-slate-400 -mt-2 mb-3">
            8+ characters · 1 number · 1 symbol
          </div>
          <Input label="Confirm password" type="password" name="confirm"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errs.c} />
          <Button type="submit" full disabled={busy}>
            {busy ? "Resetting..." : "Reset password"}
          </Button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-4">
          Remembered it? <Link to="/login" className="text-navy font-semibold">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
