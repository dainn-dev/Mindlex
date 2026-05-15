// PB4 + PB11 \u2014 Pre-checkout summary \u2192 Stripe redirect
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Lock } from "lucide-react";
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
      <div className="p-7 text-slate-500">
        No plan selected.{" "}
        <Link to="/account/subscription" className="text-navy underline">Browse plans</Link>
      </div>
    );
  }
  if (!plan) {
    return <div className="p-7 text-slate-400">Loading\u2026</div>;
  }

  const price = cycle === "monthly" ? plan.monthly.price : plan.annual.price;
  const annualSavings = (plan.annual.annualSavingsCents ?? 0) / 100;

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-12">
      <h1 className="font-display text-3xl text-navy">Confirm your subscription</h1>
      <p className="text-slate-500 text-sm">Review your plan before continuing to secure payment.</p>

      {error && <ErrorBanner message={error} />}

      <div className="card mt-5">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h3 className="text-navy">{plan.displayName} plan</h3>
            <p className="text-slate-500 text-sm">{plan.features.slice(0, 3).join(" \u00b7 ")}</p>
          </div>
          <div className="font-display text-3xl text-navy">
            {formatPrice(price, currency)}
            <span className="text-sm text-slate-500 font-sans">/{cycle === "monthly" ? "mo" : "yr"}</span>
          </div>
        </div>

        <div className="border-t border-slate-200 mt-4 pt-4">
          <div className="inline-flex bg-slate-100 rounded-full p-1 flex-wrap">
            {(["monthly", "annual"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`px-3.5 py-1.5 rounded-full text-sm capitalize ${
                  cycle === c ? "bg-white text-navy shadow-sm" : "text-slate-500"
                }`}
              >
                {c === "monthly"
                  ? `Monthly \u00b7 ${formatPrice(plan.monthly.price, currency)}`
                  : `Annual \u00b7 ${formatPrice(plan.annual.price, currency)}${annualSavings > 0 ? ` (save ${formatPrice(annualSavings, currency)})` : ""}`}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-200 mt-4 pt-4 space-y-1.5 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatPrice(price, currency)}</span></div>
          <div className="flex justify-between text-slate-500">
            <span>Tax (calculated at next step)</span><span>\u2014</span>
          </div>
          <div className="flex justify-between text-lg font-bold border-t border-dashed border-slate-200 pt-3 mt-3">
            <span>Total today</span><span>{formatPrice(price, currency)}</span>
          </div>
        </div>

        <Button full className="mt-5" onClick={proceed} loading={busy}>
          <Lock size={14} /> {busy ? "Redirecting\u2026" : "Continue to secure payment"}
        </Button>
        <p className="text-xs text-slate-400 text-center mt-3">
          Powered by Stripe \u00b7 Cancel anytime \u00b7 Tax shown at Stripe Checkout.
        </p>
      </div>

      <div className="text-center mt-4">
        <Link to="/account/subscription" className="text-sm text-slate-500 hover:underline">
          \u2190 Back to plans
        </Link>
      </div>
    </div>
  );
}

export function CheckoutSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-gradient-to-br from-emerald-50 to-white">
      <div className="card max-w-md text-center">
        <h1 className="font-display text-2xl text-navy">Welcome to Mindlex Premium</h1>
        <p className="text-slate-500 text-sm mt-2 mb-5">
          Your subscription is active. You now have full access to compliance checks, Drive and drafting.
        </p>
        <Link to="/chatbot" className="btn-primary inline-flex">Back to Chatbot</Link>
      </div>
    </div>
  );
}

export function CheckoutCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-slate-50">
      <div className="card max-w-md text-center">
        <h1 className="font-display text-2xl text-navy">Checkout cancelled</h1>
        <p className="text-slate-500 text-sm mt-2 mb-5">
          You weren't charged. Come back any time.
        </p>
        <Link to="/account/subscription" className="btn-outline inline-flex">Back to plans</Link>
      </div>
    </div>
  );
}
