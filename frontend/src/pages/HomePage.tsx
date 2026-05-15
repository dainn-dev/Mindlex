// UM14 + UM18 — Public homepage with embedded login, product preview, plans, FAQ
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check, ChevronRight, Sparkles, ShieldCheck, FileText, Newspaper,
  Plus, Minus, Bot, ArrowRight, Globe, Lock, Scale, Star, Quote
} from "lucide-react";
import { api } from "@/lib/api";
import type { Plan, PlansResponse } from "@/types";
import { LoginForm } from "@/pages/_partials/LoginForm";

const FALLBACK_PLANS: Plan[] = [
  {
    tier: "Free", displayName: "Free", currency: "EUR",
    monthly: { priceCents: 0, price: 0, stripePriceId: null },
    annual: { priceCents: 0, price: 0, stripePriceId: null, annualSavingsCents: 0, annualSavingsPercent: 0 },
    features: ["5 chat questions / day", "Plain-English answers", "Saved chat (30 min)"],
    isFree: true
  },
  {
    tier: "Plus", displayName: "Plus", currency: "EUR",
    monthly: { priceCents: 1900, price: 19, stripePriceId: null },
    annual: { priceCents: 19000, price: 190, stripePriceId: null, annualSavingsCents: 2800, annualSavingsPercent: 12.3 },
    features: ["19 queries / day", "Tone toggle (plain ↔ technical)", "Document drafting", "Legal news + saved chat (3 days)"],
    isFree: false
  },
  {
    tier: "Premium", displayName: "Premium", currency: "EUR",
    monthly: { priceCents: 4900, price: 49, stripePriceId: null },
    annual: { priceCents: 49000, price: 490, stripePriceId: null, annualSavingsCents: 8800, annualSavingsPercent: 15 },
    features: ["Unlimited queries", "Compliance + risk review", "Document upload (PDF/DOCX)", "Mindlex Drive (1 GB)", "Priority access to new features"],
    isFree: false
  }
];

const PLAN_TAGLINES: Record<string, string> = {
  Free: "Try Mindlex with no commitment.",
  Plus: "For professionals with daily legal questions.",
  Premium: "Full power — drafting, compliance, Drive."
};

const chatExamples = [
  {
    q: "Is this NDA enforceable in Cyprus?",
    a: "Yes — under Contract Law Cap. 149, this NDA meets formality requirements. However, clause 4.2's perpetual confidentiality may be unenforceable; Cyprus courts typically limit such obligations to 3–5 years.",
    chips: ["Cyprus Law", "Contract"]
  },
  {
    q: "GDPR penalty for late breach notification?",
    a: "Article 33 requires notification to the supervisory authority within 72 hours. Late notification can incur fines up to €10M or 2% of global annual turnover — whichever is higher.",
    chips: ["GDPR", "EU"]
  },
  {
    q: "Can I terminate a freelance contract early?",
    a: "Most freelance contracts allow termination with notice (typically 30 days). Without explicit terms, EU law requires reasonable notice and may entitle the freelancer to compensation for ongoing work.",
    chips: ["Freelance", "EU"]
  }
];

const features = [
  { Icon: Scale,       title: "Source-cited answers",  body: "Every reply is grounded in real statutes, case law and regulation — with click-through citations." },
  { Icon: ShieldCheck, title: "Compliance review",     body: "Upload contracts and Mindlex flags GDPR, employment and consumer-protection risks automatically." },
  { Icon: FileText,    title: "Plain-English drafts",  body: "Generate NDAs, freelance contracts and policies tailored to your jurisdiction in minutes." },
  { Icon: Globe,       title: "Multi-jurisdiction",    body: "Native support for Cyprus, EU and UK law — with monthly expansion to new regions." },
  { Icon: Newspaper,   title: "Legal news, personal",  body: "Daily curated updates on what changed in your areas of practice — never miss a key reform." },
  { Icon: Lock,        title: "Privacy-first",         body: "Documents are anonymized before AI processing. GDPR-compliant by design, EU data residency." }
];

const testimonials = [
  { name: "Maria K.",  role: "Solo Practitioner, Limassol",   quote: "Mindlex saves me hours every week. The contract review alone is worth the subscription." },
  { name: "Daniel P.", role: "Compliance Lead, Fintech",      quote: "Finally a legal tool that speaks plain English and shows me the actual statute. Game-changer for my team." },
  { name: "Anya R.",   role: "Freelance Designer, Nicosia",   quote: "I'm not a lawyer, but I sign contracts every week. Mindlex makes sure I never sign something I'd regret." }
];

const trustLogos = ["LimassolBar", "EuroCounsel", "Pegasus Legal", "Veritas Law", "Lex Cyprus"];

const faqItems = [
  { q: "What is Mindlex?", a: "A legal AI assistant that combines source-cited answers with built-in compliance tools." },
  { q: "Is my data private?", a: "All uploaded documents are anonymized for personal data before processing. We're GDPR-compliant by design." },
  { q: "Can Mindlex draft documents?", a: "Yes — switch to Drafting mode in the chatbot to generate DOCX-ready drafts." },
  { q: "What jurisdictions are supported?", a: "Cyprus, EU and UK are prioritized; we add jurisdictions monthly." },
  { q: "How is billing handled?", a: "Securely via Stripe Checkout in EUR, GBP or USD." },
  { q: "Can I cancel anytime?", a: "Yes — cancel from My Billing; you retain access until the period ends." },
  { q: "Do you offer refunds?", a: "Contact info@mindlex.ai with your transaction details." },
  { q: "How do I contact support?", a: "Email info@mindlex.ai or use the chatbot's feedback button." }
];

export function HomePage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [exIdx, setExIdx] = useState(0);

  useEffect(() => {
    api.get<PlansResponse>("/plans")
      .then((r) => setPlans(r.data?.plans ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setExIdx((s) => (s + 1) % chatExamples.length), 7000);
    return () => clearInterval(t);
  }, []);

  const planList = plans.length === 0 ? FALLBACK_PLANS : plans;
  const ex = chatExamples[exIdx];

  return (
    <div className="bg-white text-slate-900 overflow-hidden">

      {/* ===== HERO ===== */}
      <section className="relative">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-cream via-white to-white" />
        <div
          className="absolute inset-0 -z-10 opacity-[0.045]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #0b1d3a 1px, transparent 0)", backgroundSize: "24px 24px" }}
        />

        <div className="max-w-7xl mx-auto px-6 md:px-8 lg:px-16 pt-16 pb-20 grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-2 bg-white border border-gold/30 text-gold-dark text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-6 shadow-soft">
              <Sparkles size={12} /> AI legal counsel · Now in beta
            </span>
            <h1 className="font-display text-5xl lg:text-7xl text-navy leading-[1.02] tracking-tight mb-6">
              The fastest way<br />
              to{" "}
              <span className="relative inline-block">
                <span className="relative z-10 text-gold">read the law.</span>
                <span className="absolute bottom-1 left-0 right-0 h-3 bg-gold/15 -z-0 rounded" />
              </span>
            </h1>
            <p className="text-slate-600 text-lg lg:text-xl mb-8 max-w-xl leading-relaxed">
              Mindlex answers complex legal questions, reviews contracts and drafts documents — instantly, with source citations from your jurisdiction.
            </p>

            <div className="flex flex-wrap items-center gap-3 mb-10">
              <Link to="/register" className="btn-gold inline-flex items-center gap-2 text-base px-6 py-3">
                Start free <ArrowRight size={16} />
              </Link>
              <a href="#features" className="btn-outline inline-flex items-center gap-2 text-base px-6 py-3">
                See how it works
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-600" /> No credit card</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-600" /> GDPR-compliant</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-emerald-600" /> 3 jurisdictions live</span>
            </div>
          </div>

          {/* Chat mockup card */}
          <div className="relative">
            <div className="absolute -inset-8 bg-gradient-to-br from-gold/20 via-transparent to-navy/10 rounded-[3rem] blur-3xl -z-10" />

            <div className="bg-white rounded-3xl border border-slate-200 shadow-lift overflow-hidden">
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="flex gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                </div>
                <span className="text-xs text-slate-400 font-mono ml-2">mindlex.ai/chat</span>
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
                </span>
              </div>

              {/* Conversation */}
              <div key={exIdx} className="p-6 space-y-4 min-h-[340px]">
                <div className="flex gap-3 justify-end">
                  <div className="bg-navy text-white text-sm rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[85%] leading-relaxed shadow-soft">
                    {ex.q}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 shrink-0" />
                </div>

                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gold to-amber-600 shrink-0 flex items-center justify-center">
                    <Bot size={16} className="text-white" />
                  </div>
                  <div className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-2xl rounded-tl-md px-4 py-3 max-w-[85%] leading-relaxed">
                    {ex.a}
                    <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center gap-1.5">
                      {ex.chips.map((c) => <span key={c} className="chip text-[10px]">{c}</span>)}
                      <span className="text-[10px] text-slate-400 ml-auto">3 sources cited</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Input */}
              <div className="px-4 pb-4">
                <div className="flex items-center gap-2 bg-slate-100 rounded-full px-4 py-2.5 border border-slate-200">
                  <span className="text-sm text-slate-400 flex-1">Ask a legal question…</span>
                  <span className="w-7 h-7 rounded-full bg-gold flex items-center justify-center">
                    <ArrowRight size={14} className="text-navy" />
                  </span>
                </div>
              </div>
            </div>

            {/* Floating accent cards */}
            <div className="hidden md:block absolute -left-6 top-12 bg-white rounded-2xl shadow-lift border border-slate-200 px-4 py-2.5 z-10">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-600" />
                <div>
                  <div className="text-xs font-bold text-navy">No risk found</div>
                  <div className="text-[10px] text-slate-400">Contract reviewed</div>
                </div>
              </div>
            </div>

            <div className="hidden md:block absolute -right-4 bottom-6 bg-white rounded-2xl shadow-lift border border-slate-200 px-4 py-2.5 z-10">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-gold" />
                <div>
                  <div className="text-xs font-bold text-navy">Avg. 3.2s</div>
                  <div className="text-[10px] text-slate-400">Response time</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TRUST BAR ===== */}
      <section className="border-y border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="text-center text-xs uppercase tracking-widest text-slate-400 mb-5 font-semibold">
            Trusted by legal professionals across the EU
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-slate-300 font-display text-xl tracking-tight">
            {trustLogos.map((n) => (
              <span key={n} className="hover:text-slate-500 transition-colors cursor-default">{n}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="features" className="px-6 md:px-8 py-24 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 text-gold-dark text-xs font-bold uppercase tracking-widest mb-4">
            <span className="w-8 h-px bg-gold" /> Features <span className="w-8 h-px bg-gold" />
          </div>
          <h2 className="font-display text-4xl lg:text-5xl text-navy leading-tight mb-4">
            Built for the legal profession.
          </h2>
          <p className="text-slate-500 text-lg">
            Six tools, one platform. Replace four legal-tech subscriptions with Mindlex.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <div key={i} className="group bg-white border border-slate-200 rounded-2xl p-7 hover:border-gold/40 hover:shadow-lift hover:-translate-y-0.5 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-50 to-gold/10 border border-gold/20 flex items-center justify-center mb-5 group-hover:from-gold group-hover:to-amber-600 group-hover:border-gold transition-all">
                <f.Icon size={22} className="text-gold-dark group-hover:text-white transition-colors" />
              </div>
              <h3 className="font-display text-xl text-navy mb-2">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== PRODUCT PREVIEW (dark) ===== */}
      <section className="bg-navy text-white py-20 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)", backgroundSize: "32px 32px" }} />
        <div className="absolute -top-32 right-0 w-96 h-96 bg-gold/20 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 text-gold text-xs font-bold uppercase tracking-widest mb-4">
              <Sparkles size={12} /> Drive + AI Review
            </div>
            <h2 className="font-display text-4xl lg:text-5xl leading-tight mb-5">
              Drop a contract.<br />
              <span className="text-gold">Get a risk report.</span>
            </h2>
            <p className="text-white/70 text-lg mb-8 leading-relaxed">
              Mindlex Drive accepts PDF and DOCX uploads up to 50 MB. Our compliance engine analyzes clauses against GDPR, employment law and jurisdictional requirements — flagging risks with citations to the source.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "Automatic clause classification",
                "Risk severity scoring (low / medium / high)",
                "Suggested rewrites with reasoning",
                "Export annotated PDF or share link"
              ].map((x) => (
                <li key={x} className="flex items-start gap-3 text-white/90">
                  <span className="mt-0.5 w-5 h-5 rounded-full bg-gold/20 flex items-center justify-center shrink-0">
                    <Check size={12} className="text-gold" />
                  </span>
                  <span className="text-sm">{x}</span>
                </li>
              ))}
            </ul>
            <Link to="/register" className="btn-gold inline-flex items-center gap-2">
              Try the review <ArrowRight size={16} />
            </Link>
          </div>

          <div className="relative">
            <div className="bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-white/10">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200">
                <FileText size={18} className="text-navy" />
                <span className="font-semibold text-sm text-navy truncate">freelance-contract-v3.docx</span>
                <span className="ml-auto chip-success text-[10px]">Reviewed</span>
              </div>
              <div className="p-5 space-y-3">
                {[
                  { sev: "high",   label: "Section 4.2",  note: "Perpetual confidentiality clause likely unenforceable in Cyprus." },
                  { sev: "medium", label: "Section 7.1",  note: "Auto-renewal without 30-day notice violates EU Consumer Directive." },
                  { sev: "low",    label: "Section 11",   note: "Governing law unclear — recommend specifying CY jurisdiction." }
                ].map((r, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={
                        r.sev === "high" ? "chip-danger text-[10px]"
                        : r.sev === "medium" ? "chip-warn text-[10px]"
                        : "chip text-[10px]"
                      }>
                        {r.sev.toUpperCase()}
                      </span>
                      <span className="text-xs font-semibold text-navy">{r.label}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{r.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SIGN-IN (UM14) ===== */}
      <section id="sign-in" className="px-6 md:px-8 py-20 max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="font-display text-4xl text-navy leading-tight mb-4">
              Already with us?<br />
              <span className="text-gold">Welcome back.</span>
            </h2>
            <p className="text-slate-500 text-lg mb-6">
              Sign in to your Mindlex workspace and pick up where you left off.
            </p>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2"><Check size={16} className="text-emerald-600" /> Resume saved chats from 30 days</li>
              <li className="flex items-center gap-2"><Check size={16} className="text-emerald-600" /> Access your Drive documents and reviews</li>
              <li className="flex items-center gap-2"><Check size={16} className="text-emerald-600" /> Manage subscription and billing</li>
            </ul>
          </div>
          <div className="card shadow-lift border-slate-200">
            <h3 className="font-display text-2xl text-navy mb-1">Sign in</h3>
            <p className="text-sm text-slate-500 mb-4">Or use a social provider below.</p>
            <LoginForm embedded />
          </div>
        </div>
      </section>

      {/* ===== STATS ===== */}
      <section className="border-y border-slate-200 bg-gradient-to-b from-cream/50 to-white py-12">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <Stat value="10k+" label="Legal queries answered" />
          <Stat value="3"    label="Jurisdictions live" />
          <Stat value="< 5s" label="Average response" />
          <Stat value="100%" label="GDPR-compliant" />
        </div>
      </section>

      {/* ===== PLANS ===== */}
      <section className="px-6 md:px-8 py-24 max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 text-gold-dark text-xs font-bold uppercase tracking-widest mb-4">
            <span className="w-8 h-px bg-gold" /> Pricing <span className="w-8 h-px bg-gold" />
          </div>
          <h2 className="font-display text-4xl lg:text-5xl text-navy leading-tight mb-4">
            Simple, transparent plans.
          </h2>
          <p className="text-slate-500 text-lg">
            Start free. Upgrade when you need more queries, drafting or compliance review.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-5 items-stretch">
          {planList.map((p) => (
            <PlanCard
              key={p.tier}
              tier={p.tier}
              displayName={p.displayName}
              price={p.monthly.price}
              currency={p.currency}
              features={p.features}
              isFree={p.isFree}
              featured={p.tier === "Plus"}
            />
          ))}
        </div>
        <p className="text-center text-xs text-slate-400 mt-6">
          All plans billed in EUR, GBP or USD · Cancel anytime · Powered by Stripe
        </p>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="bg-cream/40 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl text-navy mb-3">
              Loved by the people who use it.
            </h2>
            <div className="inline-flex items-center gap-1 text-gold">
              {[0, 1, 2, 3, 4].map((i) => <Star key={i} size={16} fill="currentColor" />)}
              <span className="text-sm text-slate-500 ml-2">4.9 average · 200+ reviews</span>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl p-7 shadow-soft hover:shadow-lift transition-all">
                <Quote size={22} className="text-gold/40 mb-3" />
                <p className="text-slate-700 leading-relaxed text-[15px] mb-6">"{t.quote}"</p>
                <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-navy to-navy-700 text-white flex items-center justify-center font-bold text-sm">
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-navy text-sm">{t.name}</div>
                    <div className="text-xs text-slate-500">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="px-6 md:px-8 py-20 max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-display text-4xl text-navy">Frequently asked</h2>
          <p className="text-slate-500 text-base mt-3">Everything you need to know before signing up.</p>
        </div>
        <div className="space-y-3">
          {faqItems.map((it, i) => {
            const open = openFaq === i;
            return (
              <div
                key={i}
                className={`rounded-2xl border transition-all ${
                  open ? "border-gold bg-amber-50/40 shadow-soft" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                  onClick={() => setOpenFaq(open ? null : i)}
                  aria-expanded={open}
                >
                  <span className="font-semibold text-navy">{it.q}</span>
                  <span className="text-gold shrink-0 ml-3">
                    {open ? <Minus size={18} /> : <Plus size={18} />}
                  </span>
                </button>
                {open && (
                  <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed">{it.a}</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="px-6 md:px-8 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-navy via-navy to-navy-700 rounded-3xl p-12 lg:p-16 text-center text-white shadow-2xl relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-72 h-72 bg-gold/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-gold/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative">
              <Sparkles size={36} className="text-gold mx-auto mb-5" />
              <h2 className="font-display text-3xl lg:text-5xl leading-tight mb-4">
                Ready to read the law<br />in plain English?
              </h2>
              <p className="text-white/70 text-lg mb-8 max-w-xl mx-auto">
                Start free today. No credit card required. Cancel anytime.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link to="/register" className="btn-gold inline-flex items-center gap-2 text-base px-6 py-3">
                  Start free <ArrowRight size={16} />
                </Link>
                <a href="#sign-in" className="inline-flex items-center gap-2 text-sm font-semibold text-white/80 hover:text-white">
                  or sign in <ChevronRight size={14} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-3xl text-navy">{value}</div>
      <div className="text-xs uppercase tracking-wider text-slate-400 mt-1">{label}</div>
    </div>
  );
}

function PlanCard({
  tier, displayName, price, currency, features, isFree, featured
}: {
  tier: string;
  displayName: string;
  price: number;
  currency: string;
  features: string[];
  isFree: boolean;
  featured?: boolean;
}) {
  const symbol = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  return (
    <div
      className={`
        relative flex flex-col rounded-2xl p-7 transition-all
        ${featured
          ? "bg-gradient-to-b from-amber-50 via-white to-white border-2 border-gold shadow-lift md:-mt-4 z-10"
          : "bg-white border border-slate-200 shadow-soft hover:shadow-lift hover:-translate-y-0.5"}
      `}
    >
      {featured && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 bg-gold text-navy text-[11px] font-extrabold px-3 py-1 rounded-full shadow-soft whitespace-nowrap">
          <Sparkles size={12} /> MOST POPULAR
        </span>
      )}
      <div className="mb-5">
        <h3 className="font-display text-2xl text-navy">{displayName}</h3>
        <p className="text-sm text-slate-500 mt-1">{PLAN_TAGLINES[tier] ?? ""}</p>
      </div>
      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="font-display text-5xl text-navy leading-none">
            {symbol}{price}
          </span>
          <span className="text-sm font-sans font-medium text-slate-500">/mo</span>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          {isFree ? "Forever free · No card required" : "Cancel anytime · No setup fee"}
        </p>
      </div>
      <ul className="space-y-2.5 text-sm flex-1 mb-6">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <span className={`mt-0.5 inline-flex w-5 h-5 rounded-full items-center justify-center shrink-0 ${
              featured ? "bg-gold/20 text-gold-dark" : "bg-emerald-100 text-emerald-700"
            }`}>
              <Check size={12} strokeWidth={3} />
            </span>
            <span className="text-slate-700 leading-snug">{f}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/register"
        className={`${featured ? "btn-gold" : "btn-outline"} w-full inline-flex justify-center items-center gap-1`}
      >
        Get started <ChevronRight size={14} />
      </Link>
    </div>
  );
}
