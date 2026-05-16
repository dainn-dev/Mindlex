// UM19 — First-login onboarding: personalized hero, 5 tool cards, example prompts
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Scale, Newspaper, FolderOpen, Pencil, ShieldCheck,
  Sparkles, ArrowRight, MessageSquare
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/authStore";
import { api } from "@/lib/api";

interface FeatureCard {
  Icon: LucideIcon;
  title: string;
  desc: string;
  bullets: string[];
  to: string;
  state?: Record<string, unknown>;
  gradient: string;
  iconColor: string;
  badge?: string;
}

const features: FeatureCard[] = [
  {
    Icon: Scale,
    title: "Legal Assistant",
    desc: "Ask any legal question and get a source-cited answer in seconds.",
    bullets: ["Plain-English answers", "Source citations", "Tone toggle"],
    to: "/chatbot",
    gradient: "from-amber-100 to-amber-50",
    iconColor: "text-gold-dark",
    badge: "Most used"
  },
  {
    Icon: ShieldCheck,
    title: "Compliance Review",
    desc: "Upload a contract and get risks highlighted with citations.",
    bullets: ["GDPR + employment law", "Risk severity scoring", "Suggested rewrites"],
    to: "/drive",
    gradient: "from-emerald-100 to-emerald-50",
    iconColor: "text-emerald-700"
  },
  {
    Icon: Pencil,
    title: "Document Drafting",
    desc: "Generate NDAs, contracts and policies tailored to your jurisdiction.",
    bullets: ["DOCX-ready drafts", "Jurisdiction-aware", "Editable templates"],
    to: "/chatbot",
    state: { mode: "draft" },
    gradient: "from-purple-100 to-purple-50",
    iconColor: "text-purple-700"
  },
  {
    Icon: FolderOpen,
    title: "Mindlex Drive",
    desc: "Store, organize and share legal documents securely in one place.",
    bullets: ["1 GB on Premium", "PDF + DOCX upload", "Share via private link"],
    to: "/drive",
    gradient: "from-blue-100 to-blue-50",
    iconColor: "text-blue-700"
  },
  {
    Icon: Newspaper,
    title: "Legal News",
    desc: "Daily updates on what changed in your areas of practice.",
    bullets: ["Personalized topics", "Cyprus / EU / UK", "Daily 04:00 UTC digest"],
    to: "/news",
    gradient: "from-rose-100 to-rose-50",
    iconColor: "text-rose-700"
  }
];

const examples = [
  { q: "What are my GDPR obligations as a SaaS founder in the EU?", tag: "GDPR" },
  { q: "Review this NDA for unfair clauses",                         tag: "Contract review" },
  { q: "Draft a freelance contract for a UK developer",              tag: "Drafting" },
  { q: "What changed in EU AI Act this month?",                      tag: "Updates" }
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const firstName = user?.fullName?.split(" ")[0] ?? "there";

  // Skip onboarding if user has already completed it
  useEffect(() => {
    api.get<{ completed: boolean }>("/profile/onboarding/status")
      .then((r) => { if (r.data?.completed) navigate("/chatbot", { replace: true }); })
      .catch(() => undefined);
  }, [navigate]);

  const complete = async () => {
    try { await api.post("/profile/onboarding/complete"); } catch { /* ignore */ }
  };

  const goTo = async (path: string, state?: Record<string, unknown>) => {
    await complete();
    navigate(path, state ? { state } : undefined);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-cream via-white to-white">

      {/* ===== HERO ===== */}
      <section className="relative px-6 lg:px-16 pt-14 pb-10 max-w-6xl mx-auto text-center">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gold/10 rounded-full blur-3xl -z-10 pointer-events-none" />

        <div className="inline-flex items-center gap-2 bg-white border border-gold/30 text-gold-dark text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-6 shadow-soft">
          <Sparkles size={12} /> You're in
        </div>

        <h1 className="font-display text-4xl lg:text-6xl text-navy leading-[1.05] tracking-tight mb-4">
          Welcome to Mindlex,<br />
          <span className="relative inline-block">
            <span className="relative z-10 text-gold">{firstName}.</span>
            <span className="absolute bottom-1 left-0 right-0 h-3 bg-gold/15 -z-0 rounded" />
          </span>
        </h1>
        <p className="text-slate-500 text-base lg:text-lg max-w-xl mx-auto">
          Five tools that turn legal complexity into clarity. Pick anything to begin — we'll save your progress.
        </p>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mt-8 text-xs text-slate-400 uppercase tracking-wider font-semibold">
          <span className="w-8 h-1 rounded-full bg-gold" />
          <span className="w-8 h-1 rounded-full bg-slate-200" />
          <span className="w-8 h-1 rounded-full bg-slate-200" />
          <span className="ml-2">Step 1 of 3 · Pick a tool</span>
        </div>
      </section>

      {/* ===== TOOL GRID ===== */}
      <section className="px-6 lg:px-16 pb-12 max-w-7xl mx-auto">
        <div className="flex items-end justify-between mb-5">
          <div>
            <h2 className="font-display text-2xl text-navy">Choose your starting point</h2>
            <p className="text-sm text-slate-500 mt-1">Each tool takes about 30 seconds to try.</p>
          </div>
          <span className="hidden md:inline text-xs text-slate-400 uppercase tracking-wider font-semibold">5 tools</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <button
              key={f.title}
              onClick={() => goTo(f.to, f.state)}
              className="group relative bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-gold/40 hover:shadow-lift hover:-translate-y-1 transition-all"
            >
              {f.badge && (
                <span className="absolute top-4 right-4 inline-flex items-center gap-1 bg-gold/10 text-gold-dark text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
                  <Sparkles size={10} /> {f.badge}
                </span>
              )}

              <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${f.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <f.Icon size={26} className={f.iconColor} />
              </div>

              <h3 className="font-display text-xl text-navy mb-1.5">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-4">{f.desc}</p>

              <ul className="space-y-1.5 mb-5">
                {f.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2 text-xs text-slate-600">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-gold shrink-0" />
                    {b}
                  </li>
                ))}
              </ul>

              <div className="inline-flex items-center gap-1 text-sm font-semibold text-gold-dark group-hover:gap-2 transition-all">
                Try it <ArrowRight size={14} />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ===== EXAMPLES ===== */}
      <section className="px-6 lg:px-16 pb-12 max-w-5xl mx-auto">
        <div className="bg-white border border-slate-200 rounded-2xl p-7 lg:p-8 shadow-soft">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-gold/20 flex items-center justify-center shrink-0">
              <MessageSquare size={18} className="text-gold-dark" />
            </div>
            <div>
              <h2 className="font-display text-xl text-navy">Or try a quick question</h2>
              <p className="text-xs text-slate-500 mt-0.5">We'll open the chat with this pre-filled.</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {examples.map((ex) => (
              <button
                key={ex.q}
                onClick={() => goTo("/chatbot", { prefill: ex.q })}
                className="group flex items-start gap-3 bg-cream/40 border border-slate-200 rounded-xl px-4 py-3.5 text-left hover:border-gold hover:bg-amber-50/40 transition-all"
              >
                <div className="mt-0.5 w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 group-hover:border-gold transition-colors">
                  <MessageSquare size={13} className="text-slate-400 group-hover:text-gold transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-navy leading-snug">{ex.q}</div>
                  <span className="inline-block mt-1.5 chip text-[10px]">{ex.tag}</span>
                </div>
                <ArrowRight size={14} className="mt-1 text-slate-300 group-hover:text-gold group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FOOTER CTA ===== */}
      <section className="px-6 lg:px-16 pb-16 max-w-5xl mx-auto">
        <div className="pt-6 border-t border-slate-200">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-slate-500 text-center sm:text-left">
              You can revisit any tool anytime from the sidebar.
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => goTo("/chatbot")}>Skip tour</Button>
              <Button onClick={() => goTo("/chatbot")} className="inline-flex items-center gap-2">
                Take me to chat <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
