// UM3 — Email verification with resend countdown
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, AlertTriangle, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { useUiStore } from "@/store/uiStore";

export function EmailVerifyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email = (location.state as { email?: string })?.email ?? "";
  const token = params.get("token");
  const userId = params.get("userId");
  const expired = params.get("expired") === "1";
  const [countdown, setCountdown] = useState(60);
  const [verified, setVerified] = useState(false);
  const showToast = useUiStore((s) => s.showToast);

  useEffect(() => {
    if (!token || !userId) return;
    api.post("/auth/verify-email", { userId, token })
      .then(() => setVerified(true))
      .catch(() => undefined);
  }, [token, userId]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const resend = async () => {
    try {
      await api.post("/auth/resend-verification", { email });
      setCountdown(60);
      showToast("success", "Verification email resent.");
    } catch {
      showToast("danger", "Could not resend. Try again later.");
    }
  };

  if (verified) {
    return (
      <Wrap>
        <CheckCircle2 size={56} className="mx-auto text-emerald-500 mb-3" />
        <h2 className="font-display text-2xl text-navy">Email verified!</h2>
        <p className="text-slate-500 text-sm mb-5">You can now sign in to your account.</p>
        <Button full onClick={() => navigate("/login")}>Go to Dashboard</Button>
      </Wrap>
    );
  }

  if (expired) {
    return (
      <Wrap>
        <AlertTriangle size={56} className="mx-auto text-amber-500 mb-3" />
        <h2 className="font-display text-2xl text-navy">This verification link has expired</h2>
        <p className="text-slate-500 text-sm mb-5">Request a new one below.</p>
        <Button full onClick={resend}>Send new link</Button>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <Mail size={56} className="mx-auto text-navy mb-3" />
      <h2 className="font-display text-2xl text-navy">Check your email</h2>
      <p className="text-slate-500 text-sm">
        We sent a verification link to <strong>{email || "your inbox"}</strong>
      </p>
      <div className="bg-amber-50 rounded-md text-sm text-slate-600 my-5 p-4">
        Click the link in the email to verify your account. The link expires in 24 hours.
      </div>
      <Button
        full variant="outline"
        disabled={countdown > 0}
        onClick={resend}
      >
        {countdown > 0 ? `Resend in 0:${String(countdown).padStart(2, "0")}` : "Resend verification email"}
      </Button>
      <p className="text-center text-sm text-slate-500 mt-4">
        Already verified? <Link to="/login" className="text-navy font-semibold">Sign in →</Link>
      </p>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-navy to-navy-600">
      <div className="bg-white rounded-2xl p-9 w-full max-w-md shadow-lift text-center">
        {children}
      </div>
    </div>
  );
}
