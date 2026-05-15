// UM19 — First-login onboarding with 5 feature cards + example questions
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Scale, Newspaper, FolderOpen, Pencil, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/authStore";
import { api } from "@/lib/api";

const features: { Icon: LucideIcon; title: string; desc: string }[] = [
  { Icon: Scale,       title: "Legal Assistant",  desc: "Ask any legal question" },
  { Icon: Newspaper,   title: "Legal News",       desc: "Personalized updates" },
  { Icon: FolderOpen,  title: "Legal Drive",      desc: "Store & share docs" },
  { Icon: Pencil,      title: "Legal Draft",      desc: "Generate documents" },
  { Icon: ShieldCheck, title: "Legal Compliance", desc: "Audit your contracts" }
];

const examples = [
  "What are my GDPR obligations as a SaaS founder in the EU?",
  "Review this NDA for unfair clauses",
  "Draft a freelance contract for a UK developer",
  "What changed in EU AI Act this month?"
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // Skip onboarding if user has already gone through it (avoids re-showing it).
  useEffect(() => {
    api.get<{ completed: boolean }>("/profile/onboarding/status")
      .then((r) => { if (r.data?.completed) navigate("/chatbot", { replace: true }); })
      .catch(() => undefined);
  }, [navigate]);

  const finish = async () => {
    try { await api.post("/profile/onboarding/complete"); } catch {/* ignore */}
    navigate("/chatbot");
  };

  return (
    <div className="px-6 lg:px-16 py-10">
      <div className="text-center mb-6">
        <h1 className="font-display text-3xl text-navy">
          Welcome to Mindlex, {user?.fullName?.split(" ")[0] ?? "there"}
        </h1>
        <p className="text-slate-500 text-base mt-2">
          Five tools that turn legal complexity into clarity. Pick any to begin.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5 max-w-5xl mx-auto">
        {features.map((f) => (
          <button
            key={f.title}
            onClick={finish}
            className="bg-white border border-slate-200 rounded-xl p-4 text-center hover:-translate-y-1 hover:shadow-lift hover:border-gold transition-all"
          >
            <f.Icon size={28} className="mx-auto text-gold mb-2" />
            <h5 className="text-navy font-semibold">{f.title}</h5>
            <p className="text-xs text-slate-500 mt-1">{f.desc}</p>
          </button>
        ))}
      </div>

      <div className="bg-amber-50 rounded-xl p-5 mt-6 max-w-3xl mx-auto">
        <h5 className="text-navy font-semibold mb-2">Try one of these to get started:</h5>
        {examples.map((q) => (
          <button
            key={q}
            onClick={() => navigate("/chatbot", { state: { prefill: q } })}
            className="block w-full text-left bg-white border border-slate-200 rounded-md px-3.5 py-2 text-sm mt-1.5 hover:border-gold"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="text-center mt-7 flex justify-center gap-2">
        <Button onClick={finish}>Get started</Button>
        <Button variant="ghost" onClick={finish}>Skip tour</Button>
      </div>
    </div>
  );
}
