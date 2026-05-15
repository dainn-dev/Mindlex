// UM6 — OAuth complete profile (DOB) after social signup
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { validators } from "@/lib/utils";
import { apiError } from "@/lib/api";

export function OAuthCompleteProfilePage() {
  const navigate = useNavigate();
  const completeSocialProfile = useAuthStore((s) => s.completeSocialProfile);
  const showToast = useUiStore((s) => s.showToast);
  const [dob, setDob] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dob) { setErr("Date of birth is required."); return; }
    if (!validators.age18(dob)) { setErr("You must be at least 18 years old."); return; }
    setErr(null);
    setBusy(true);
    try {
      await completeSocialProfile(dob);
      showToast("success", "Profile completed.");
      navigate("/onboarding");
    } catch (e2) {
      setErr(apiError(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-navy to-navy-600">
      <div className="bg-white rounded-2xl p-9 w-full max-w-md shadow-lift">
        <h2 className="font-display text-2xl text-navy text-center">Almost done</h2>
        <p className="text-center text-slate-500 text-sm mb-6">
          We just need a few more details to finish setting up your account.
        </p>
        {err && <ErrorBanner message={err} />}
        <form onSubmit={submit} noValidate>
          <Input
            type="date"
            label="Date of birth"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
          <Button type="submit" full loading={busy}>
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
