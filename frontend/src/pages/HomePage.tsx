// UM14 + UM18 \u2014 Public homepage with embedded login, carousel, plans, FAQ
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import type { Plan, PlansResponse } from "@/types";
import { Button } from "@/components/ui/Button";
import { LoginForm } from "@/pages/_partials/LoginForm";

const FALLBACK_PLANS: Plan[] = [
  {
    tier: "Free", displayName: "Free", currency: "EUR",
    monthly: { priceCents: 0, price: 0, stripePriceId: null },
    annual: { priceCents: 0, price: 0, stripePriceId: null, annualSavingsCents: 0, annualSavingsPercent: 0 },
    features: ["5 chat questions / day", "Plain-English answers"],
    isFree: true
  },
  {
    tier: "Plus", displayName: "Plus", currency: "EUR",
    monthly: { priceCents: 1900, price: 19, stripePriceId: null },
    annual: { priceCents: 19000, price: 190, stripePriceId: null, annualSavingsCents: 2800, annualSavingsPercent: 12.3 },
    features: ["Unlimited chat", "Tone toggle", "History"],
    isFree: false
  },
  {
    tier: "Premium", displayName: "Premium", currency: "EUR",
    monthly: { priceCents: 4900, price: 49, stripePriceId: null },
    annual: { priceCents: 49000, price: 490, stripePriceId: null, annualSavingsCents: 8800, annualSavingsPercent: 15 },
    features: ["All Plus", "Compliance check", "Drive + Drafting"],
    isFree: false
  }
];

const carouselSlides = [
  { title: "Ask anything legal.", body: "From NDAs to GDPR \u2014 get answers grounded in jurisdiction-specific sources, in seconds." },
  { title: "Compliance, automated.", body: "Upload a draft contract and let Mindlex flag risks and suggest fixes." },
  { title: "Drafts in plain English.", body: "Generate freelance contracts, NDAs and policies in minutes." },
  { title: "Stay ahead of the law.", body: "Personalized news on what changed in your jurisdiction this week." }
];

const faqItems = [
  { q: "What is Mindlex?", a: "A legal AI assistant that combines source-cited answers with built-in compliance tools." },
  { q: "Is my data private?", a: "All uploaded documents are anonymized for personal data before processing." },
  { q: "Can Mindlex draft documents?", a: "Yes \u2014 switch to Drafting mode in the chatbot to generate DOCX-ready drafts." },
  { q: "What jurisdictions are supported?", a: "Cyprus, EU and UK are prioritized; we add jurisdictions monthly." },
  { q: "How is billing handled?", a: "Securely via Stripe Checkout in EUR, GBP or USD." },
  { q: "Can I cancel anytime?", a: "Yes \u2014 cancel from My Billing; you retain access until the period ends." },
  { q: "Do you offer refunds?", a: "Contact info@mindlex.ai with your transaction details." },
  { q: "How do I contact support?", a: "Email info@mindlex.ai or use the chatbot's feedback button." }
];

export function HomePage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [slide, setSlide] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    api.get<PlansResponse>("/plans")
      .then((r) => setPlans(r.data?.plans ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % carouselSlides.length), 6000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="bg-gradient-to-b from-white to-cream text-slate-900">
      <section className="grid lg:grid-cols-2 gap-12 px-8 py-12 lg:px-16">
        <div>
          <h1 className="font-display text-4xl lg:text-5xl text-navy leading-tight mb-3">
            Your AI legal counsel.<br />On call, in plain English.
          </h1>
          <p className="text-slate-500 text-lg mb-6">
            Mindlex helps individuals and teams understand contracts, regulations and risks \u2014 instantly.
          </p>
          <div className="card max-w-md">
            <LoginForm embedded />
          </div>
        </div>
        <div className="relative bg-gradient-to-br from-navy to-navy-600 rounded-2xl p-8 flex flex-col justify-between text-white min-h-[320px] shadow-lift overflow-hidden">
          <div className="flex gap-1.5 z-10">
            {carouselSlides.map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all ${i === slide ? "bg-gold w-6" : "bg-white/40 w-2"}`}
              />
            ))}
          </div>
          <div className="z-10">
            <h3 className="font-display text-2xl text-gold mb-2">{carouselSlides[slide].title}</h3>
            <p className="text-sm opacity-85 max-w-sm">{carouselSlides[slide].body}</p>
          </div>
        </div>
      </section>

      <section className="px-8 lg:px-16 py-10">
        <h2 className="font-display text-3xl text-center text-navy mb-8">Explore Plans</h2>
        <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {(plans.length === 0 ? FALLBACK_PLANS : plans).map((p) => (
            <PlanCard
              key={p.tier}
              tier={p.tier}
              price={p.monthly.price}
              currency={p.currency}
              features={p.features}
              featured={p.tier === "Plus"}
            />
          ))}
        </div>
      </section>

      <section className="px-8 py-10 max-w-3xl mx-auto">
        <h2 className="font-display text-2xl text-navy mb-4">Frequently asked</h2>
        {faqItems.map((it, i) => (
          <div
            key={i}
            className="border-b border-slate-200 py-3.5 cursor-pointer"
            onClick={() => setOpenFaq(openFaq === i ? null : i)}
          >
            <div className="flex justify-between font-semibold text-navy">
              {it.q}
              <span className="text-gold text-xl leading-none">
                {openFaq === i ? "\u2212" : "+"}
              </span>
            </div>
            {openFaq === i && <div className="text-sm text-slate-500 mt-2">{it.a}</div>}
          </div>
        ))}
      </section>
    </div>
  );
}

function PlanCard({
  tier, price, currency, features, featured
}: { tier: string; price: number; currency: string; features: string[]; featured?: boolean }) {
  const symbol = currency === "EUR" ? "\u20ac" : currency === "GBP" ? "\u00a3" : "$";
  return (
    <div
      className={`rounded-xl p-5 border ${
        featured
          ? "border-gold bg-gradient-to-b from-white to-amber-50 shadow-lift relative"
          : "border-slate-200 bg-white"
      }`}
    >
      {featured && (
        <span className="absolute -top-2.5 right-5 bg-gold text-navy text-[10px] font-extrabold px-2.5 py-1 rounded">
          POPULAR
        </span>
      )}
      <h3 className="text-navy">{tier}</h3>
      <div className="font-display text-4xl text-navy my-2">
        {symbol}{price}
        <span className="text-sm font-sans font-medium text-slate-500">/mo</span>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {features.map((f) => (
          <li key={f} className="pl-5 relative">
            <span className="absolute left-0 text-gold font-bold">\u2713</span>
            {f}
          </li>
        ))}
      </ul>
      <Link to="/register" className="btn-outline w-full mt-4 inline-flex justify-center">
        Get started
      </Link>
    </div>
  );
}
