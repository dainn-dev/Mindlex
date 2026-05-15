// PB1 + PB3 + PB10 + PB11 \u2014 Plans + currency + cycle + upgrade/downgrade
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { formatPrice } from "@/lib/utils";
import { useUiStore } from "@/store/uiStore";
import type { Plan, PlansResponse, MySubscription, Currency, BillingCycle } from "@/types";

const CURRENCIES: Currency[] = ["EUR", "GBP", "USD"];
const CURR_KEY = "mindlex.currency";

export function SubscriptionPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<MySubscription | null>(null);
  const [currency, setCurrency] = useState<Currency>(
    (localStorage.getItem(CURR_KEY) as Currency) ?? "EUR"
  );
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [downgradeConfirm, setDowngradeConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const showToast = useUiStore((s) => s.showToast);

  useEffect(() => {
    localStorage.setItem(CURR_KEY, currency);
    api.get<PlansResponse>(`/plans?currency=${currency}`)
      .then((r) => setPlans(r.data?.plans ?? []))
      .catch(() => undefined);
    api.get<MySubscription>(`/subscriptions/me?currency=${currency}`)
      .then((r) => setSub(r.data))
      .catch(() => undefined);
  }, [currency]);

  const currentTier = sub?.currentTier;
  const isCancelScheduled = sub?.subscription?.cancelAtPeriodEnd === true;

  const ctaFor = (plan: Plan) => {
    if (!currentTier) return { label: "Get started", action: () => goCheckout(plan) };
    if (currentTier === plan.tier) return { label: "\u2713 Current plan", disabled: true };
    if (plan.tier === "Plus" && currentTier === "Premium") {
      return { label: "Downgrade to Plus", action: () => setDowngradeConfirm(true), variant: "outline" as const };
    }
    if (plan.tier === "Free") return { label: "\u2014", disabled: true };
    return { label: `Upgrade to ${plan.tier}`, action: () => goCheckout(plan) };
  };

  const goCheckout = (plan: Plan) => {
    navigate(`/checkout?plan=${plan.tier}&cycle=${cycle}&currency=${currency}`);
  };

  const downgrade = async () => {
    setBusy(true);
    try {
      await api.post("/subscriptions/downgrade-to-plus");
      showToast("success", "Your Premium access will remain until end of period.");
    } catch { showToast("danger", "Could not downgrade"); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <h1 className="font-display text-2xl text-navy">Subscription plans</h1>
      <p className="text-slate-500 text-sm mb-5">
        {sub ? (
          <>You are on <strong>{currentTier}</strong>{
            sub.subscription?.currentPeriodEnd
              ? ` \u2014 ${isCancelScheduled ? "access until" : "next charge"} ${new Date(sub.subscription.currentPeriodEnd).toLocaleDateString()}`
              : ""
          }</>
        ) : "Choose the plan that fits you best."}
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="inline-flex bg-slate-100 rounded-full p-1">
          {(["monthly", "annual"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={`px-3.5 py-1.5 rounded-full text-sm capitalize ${
                cycle === c ? "bg-white text-navy shadow-sm" : "text-slate-500"
              }`}
            >
              {c}
              {c === "annual" && <span className="ml-1 chip-gold text-[10px]">\u221220%</span>}
            </button>
          ))}
        </div>
        <select
          className="input max-w-[120px] ml-auto"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
        >
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {plans.length === 0 ? (
          <p className="text-slate-400 col-span-3 text-center py-8">Loading plans\u2026</p>
        ) : plans.map((p) => {
          const cta = ctaFor(p);
          const price = cycle === "monthly" ? p.monthly.price : p.annual.price / 12;
          const featured = p.tier === "Plus";
          return (
            <div
              key={p.tier}
              className={`rounded-xl p-5 border ${
                featured ? "border-gold bg-gradient-to-b from-white to-amber-50 shadow-lift relative" : "border-slate-200 bg-white"
              }`}
            >
              {featured && (
                <span className="absolute -top-2.5 right-5 bg-gold text-navy text-[10px] font-extrabold px-2.5 py-1 rounded">
                  POPULAR
                </span>
              )}
              <h3 className="text-navy">{p.displayName}</h3>
              <div className="font-display text-4xl text-navy my-2">
                {formatPrice(price, currency)}
                <span className="text-sm font-sans font-medium text-slate-500">/mo</span>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="pl-5 relative">
                    <span className="absolute left-0 text-gold font-bold">\u2713</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                full
                className="mt-4"
                variant={cta.variant ?? "primary"}
                disabled={cta.disabled}
                onClick={cta.action}
              >
                {cta.label}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-400 text-center mt-4">
        Prices may include applicable taxes based on your billing address.
      </p>

      <ConfirmModal
        open={downgradeConfirm}
        title="Downgrade to Plus?"
        message="Your Premium features will remain active until the end of the current period."
        confirmText="Downgrade"
        onConfirm={async () => { await downgrade(); setDowngradeConfirm(false); }}
        onClose={() => setDowngradeConfirm(false)}
      />
    </div>
  );
}
