// UM1 + UM2 + UM15 — Registration form with validation + social
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { validators } from "@/lib/utils";
import { apiError } from "@/lib/api";

interface FormState {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  dateOfBirth: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
}

const initial: FormState = {
  fullName: "", email: "", password: "", confirmPassword: "",
  dateOfBirth: "", acceptTerms: false, acceptPrivacy: false
};

export function RegisterPage() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const showToast = useUiStore((s) => s.showToast);
  const [data, setData] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setData((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const e: typeof errors = {};
    if (!data.fullName) e.fullName = "Full name is required";
    if (!data.email) e.email = "Email is required";
    else if (!validators.email(data.email)) e.email = "Enter a valid email address.";
    if (!data.password) e.password = "Password is required";
    else if (!validators.password(data.password))
      e.password = "Must be at least 8 chars with 1 number and 1 symbol.";
    if (data.password !== data.confirmPassword)
      e.confirmPassword = "Passwords do not match.";
    if (!data.dateOfBirth) e.dateOfBirth = "Date of birth is required";
    else if (!validators.age18(data.dateOfBirth))
      e.dateOfBirth = "You must be at least 18 years old.";
    if (!data.acceptTerms) e.acceptTerms = "Required";
    if (!data.acceptPrivacy) e.acceptPrivacy = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setBusy(true);
    try {
      await register(data);
      showToast("success", "Account created. Please check your email.");
      navigate("/verify-email", { state: { email: data.email } });
    } catch (err) {
      setBanner(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-navy to-navy-600">
      <div className="bg-white rounded-2xl p-9 w-full max-w-lg shadow-lift">
        <h2 className="font-display text-2xl text-navy text-center">Create your account</h2>
        <p className="text-center text-slate-500 text-sm mb-6">Free forever, no credit card required.</p>
        {banner && <ErrorBanner message={banner} />}
        {errorCount > 0 && (
          <ErrorBanner message={`Please fix the following ${errorCount} errors before continuing.`} />
        )}
        <form onSubmit={submit} noValidate>
          <Input label="Full name" name="fullName" value={data.fullName}
            onChange={(e) => set("fullName", e.target.value)} error={errors.fullName} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Email" name="email" type="email" value={data.email}
              onChange={(e) => set("email", e.target.value)} error={errors.email} />
            <Input label="Date of birth" name="dob" type="date" value={data.dateOfBirth}
              onChange={(e) => set("dateOfBirth", e.target.value)} error={errors.dateOfBirth} />
          </div>
          <Input label="Password" name="password" type="password" value={data.password}
            onChange={(e) => set("password", e.target.value)} error={errors.password} />
          <Input label="Confirm password" name="confirmPassword" type="password"
            value={data.confirmPassword}
            onChange={(e) => set("confirmPassword", e.target.value)}
            error={errors.confirmPassword} />
          <label className="flex items-start gap-2 text-sm mb-3">
            <input type="checkbox" checked={data.acceptTerms}
              onChange={(e) => set("acceptTerms", e.target.checked)} className="mt-1" />
            <span className={errors.acceptTerms ? "text-red-500" : ""}>
              I have read and agree to the <Link to="/terms" className="underline">Terms of Service</Link>.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm mb-4">
            <input type="checkbox" checked={data.acceptPrivacy}
              onChange={(e) => set("acceptPrivacy", e.target.checked)} className="mt-1" />
            <span className={errors.acceptPrivacy ? "text-red-500" : ""}>
              I have read and agree to the <Link to="/privacy" className="underline">Privacy Policy</Link>.
            </span>
          </label>
          <Button type="submit" full disabled={busy}>
            {busy ? "Creating account..." : "Create account"}
          </Button>
        </form>
        <p className="text-center text-sm text-slate-500 mt-4">
          Already have an account? <Link to="/login" className="text-navy font-semibold">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
