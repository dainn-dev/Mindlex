// PB4 + PB11 — Pre-checkout summary → Stripe redirect
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Lock, Check, ShieldCheck, Sparkles, Trophy, CheckCircle2, ChevronLeft } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { formatPrice } from "@/lib/utils";
import { useUiStore } from "@/store/uiStore";
import type { Plan, PlansResponse, BillingCycle, Currency, Role } from "@/types";

export function CheckoutPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const planTierParam = params.get("plan") as Exclude<Role, "Admin"> | null;
  const [cycle, setCycle] = useState<BillingCycle>((params.get("cycle") as BillingCycle) ?? "monthly");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currency] = useState<Currency>(
    (params.get("currency") as Currency)
    ?? (localStorage.getItem("mindlex.currency") as Currency)
    ?? "EUR"
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const showToast = useUiStore((s) => s.showToast);

  useEffect(() => {
    api.get<PlansResponse>(`/plans?currency=${currency}`)
      .then((r) => {
        const list = r.data?.plans ?? [];
        setPlans(list);
        if (planTierParam && !list.some((p) => p.tier === planTierParam)) {
          setError("Plan not found");
        }
      })
      .catch(() => setError("Could not load plans"));
  }, [currency, planTierParam]);

  const plan = useMemo<Plan | null>(
    () => plans.find((p) => p.tier === planTierParam) ?? null,
    [plans, planTierParam]
  );

  const proceed = async () => {
    if (!plan) return;
    const priceTier = cycle === "monthly" ? plan.monthly : plan.annual;
    const priceId = priceTier.stripePriceId;
    if (!priceId) {
      setError("This plan is not available for purchase.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post("/subscriptions/checkout", {
        priceId,
        successUrl: `${window.location.origin}/checkout/success`,
        cancelUrl: `${window.location.origin}/checkout/cancel`
      });
      window.location.href = data.url;
    } catch (e) {
      setError(apiError(e));
      showToast("danger", "Checkout failed");
      setBusy(false);
    }
  };

  if (!planTierParam) {
    return (
      <div className="max-w-md mx-auto p-10 text-center">
        <p className="text-slate-500 mb-4">No plan selected.</p>
        <Link to="/account/subscription" className="btn-primary inline-flex items-center gap-1">
          <ChevronLeft size={14} /> Browse plans
        </Link>
      </div>
    );
  }
  if (!plan) {
    return <div className="p-10 text-slate-400 text-center">Loading…</div>;
  }

  const price = cycle === "monthly" ? plan.monthly.price : plan.annual.price;
  const monthlyEquiv = cycle === "annual" ? plan.annual.price / 12 : plan.monthly.price;
  const annualSavings = (plan.annual.annualSavingsCents ?? 0) / 100;
  const annualSavingsPct = plan.annual.annualSavingsPercent ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-cream to-white py-10 md:py-16">
      <div className="max-w-3xl mx-auto px-4 md:px-6">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-1.5 bg-gold/10 text-gold-dark text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
            <Sparkles size={12} /> One step away
          </span>
          <h1 className="font-display text-4xl text-navy">Confirm your subscription</h1>
          <p className="text-slate-500 text-sm mt-2">Review your plan before continuing to secure payment.</p>
        </div>

        {error && <ErrorBanner message={error} />}

        <div className="bg-white border border-slate-200 rounded-2xl shadow-lift overflow-hidden">
          {/* Plan summary header */}
          <div className="bg-gradient-to-br from-navy to-navy-700 text-white p-6 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Trophy size={18} className="text-gold" />
                <span className="text-xs uppercase tracking-wider text-gold font-semibold">
                  {plan.tier} plan
                </span>
              </div>
              <h3 className="font-display text-2xl">{plan.displayName}</h3>
              <p className="text-sm opacity-75 mt-1">{plan.features.slice(0, 2).join(" · ")}</p>
            </div>
            <div className="text-right shrink-0">
              <div className="font-display text-4xl leading-none">{formatPrice(price, currency)}</div>
              <div className="text-xs opacity-75 mt-1">/{cycle === "monthly" ? "month" : "year"}</div>
            </div>
          </div>

          <div className="p-6">
            {/* Cycle toggle */}
            <div className="mb-5">
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Billing cycle</div>
              <div className="inline-flex bg-slate-100 rounded-full p-1">
                {(["monthly", "annual"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCycle(c)}
                    className={`px-4 py-1.5 rounded-full text-sm capitalize transition-all ${
                      cycle === c
                        ? "bg-white text-navy shadow-soft font-semibold"
                        : "text-slate-500 hover:text-navy"
                    }`}
                  >
                    {c}
                    {c === "annual" && annualSavingsPct > 0 && (
                      <span className="ml-1.5 bg-gold text-navy text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                        −{Math.round(annualSavingsPct)}%
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* What you get */}
            <div className="mb-5">
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-3">What you get</div>
              <ul className="space-y-2 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <span className="mt-0.5 inline-flex w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 items-center justify-center shrink-0">
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span className="text-slate-700">{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Cost breakdown */}
            <div className="border-t border-slate-200 pt-4 space-y-1.5 text-sm mb-5">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span className="text-slate-700">{formatPrice(price, currency)}</span>
              </div>
              {cycle === "annual" && annualSavings > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>Annual discount</span>
                  <span>−{formatPrice(annualSavings, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-500">
                <span>Tax</span>
                <span className="text-xs">Calculated at next step</span>
              </div>
              <div className="flex justify-between text-base font-bold text-navy border-t border-dashed border-slate-200 pt-3 mt-3">
                <span>Due today</span>
                <span className="font-display text-xl">{formatPrice(price, currency)}</span>
              </div>
              {cycle === "annual" && (
                <p className="text-xs text-slate-400 text-right">
                  ≈ {formatPrice(monthlyEquiv, currency)}/month
                </p>
              )}
            </div>

            <Button full size="lg" onClick={proceed} loading={busy}>
              <Lock size={14} /> Continue to secure payment
            </Button>

            <div className="flex items-center justify-center gap-4 text-xs text-slate-400 mt-4">
              <span className="inline-flex items-center gap-1"><ShieldCheck size={12} /> Powered by Stripe</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} /> Cancel anytime</span>
            </div>
          </div>
        </div>

        <div className="text-center mt-5">
          <Link to="/account/subscription" className="text-sm text-slate-500 hover:underline inline-flex items-center gap-1">
            <ChevronLeft size={14} /> Back to plans
          </Link>
        </div>
      </div>
    </div>
  );
}

export function CheckoutSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-emerald-50 via-white to-cream">
      <div className="bg-white rounded-2xl p-9 max-w-md text-center shadow-lift border border-emerald-100">
        <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <CheckCircle2 size={36} className="text-emerald-600" />
        </div>
        <h1 className="font-display text-3xl text-navy mb-2">Welcome aboard!</h1>
        <p className="text-slate-500 text-sm mb-6">
          Your subscription is active. You now have full access to compliance checks, Drive and drafting.
        </p>
        <Link to="/chatbot" className="btn-primary inline-flex items-center gap-1">
          Start using Mindlex <ChevronLeft size={14} className="rotate-180" />
        </Link>
      </div>
    </div>
  );
}

export function CheckoutCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-slate-50">
      <div className="bg-white rounded-2xl p-9 max-w-md text-center shadow-soft border border-slate-200">
        <h1 className="font-display text-2xl text-navy mb-2">Checkout cancelled</h1>
        <p className="text-slate-500 text-sm mb-6">
          You weren't charged. Come back any time to upgrade.
        </p>
        <div className="flex gap-2 justify-center">
          <Link to="/account/subscription" className="btn-outline inline-flex">Back to plans</Link>
          <Link to="/chatbot" className="btn-primary inline-flex">Continue free</Link>
        </div>
      </div>
    </div>
  );
}
