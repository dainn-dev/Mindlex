// UM6 (part 1) — Forgot password: email entry → generic confirmation
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { validators } from "@/lib/utils";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validators.email(email)) {
      setError("Enter a valid email address.");
      return;
    }
    try { await api.post("/auth/forgot-password", { email }); } catch {/* swallow */}
    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-navy to-navy-600">
      <div className="bg-white rounded-2xl p-9 w-full max-w-md shadow-lift">
        {sent ? (
          <div className="text-center">
            <div className="text-5xl mb-3">📩</div>
            <h2 className="font-display text-2xl text-navy mb-2">Check your inbox</h2>
            <p className="text-slate-500 text-sm">
              If you are registered in the platform, please check your email for password reset instructions.
            </p>
            <Link to="/login" className="btn-outline w-full mt-5 inline-flex justify-center">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h2 className="font-display text-2xl text-navy text-center">Forgot your password?</h2>
            <p className="text-center text-slate-500 text-sm mb-5">
              Enter your email and we'll send reset instructions.
            </p>
            <Input
              type="email"
              name="email"
              label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error}
            />
            <Button type="submit" full>Send reset link</Button>
            <p className="text-center text-sm text-slate-500 mt-4">
              <Link to="/login" className="text-navy font-semibold">← Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
