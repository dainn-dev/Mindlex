// UM4 — Standalone login page
import { Link } from "react-router-dom";
import { LoginForm } from "./_partials/LoginForm";

export function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-navy to-navy-600">
      <div className="bg-white rounded-2xl p-9 w-full max-w-md shadow-lift">
        <div className="text-center mb-4">
          <Link to="/" className="inline-flex items-center gap-2 font-display text-xl font-bold text-navy">
            <span className="w-7 h-7 bg-navy text-gold rounded-md flex items-center justify-center text-xs font-extrabold">M</span>
            Mindlex
          </Link>
        </div>
        <h2 className="font-display text-2xl text-navy text-center">Welcome back</h2>
        <p className="text-center text-slate-500 text-sm mb-6">
          Sign in to continue to your dashboard.
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
