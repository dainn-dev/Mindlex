// PB1 + PB3 + PB10 + PB11 — Plans + currency + cycle + upgrade/downgrade
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Shield, ChevronRight, Sparkles } from "lucide-react";
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

  // Compute biggest annual savings across paid plans for the toggle pill.
  const maxAnnualSavingsPercent = useMemo(() => {
    const paid = plans.filter((p) => !p.isFree && p.annual.annualSavingsPercent > 0);
    return paid.length === 0 ? 0 : Math.max(...paid.map((p) => p.annual.annualSavingsPercent));
  }, [plans]);

  const ctaFor = (plan: Plan): { label: string; action?: () => void; disabled?: boolean; variant?: "primary" | "gold" | "outline" } => {
    if (!currentTier) return { label: "Get started", action: () => goCheckout(plan), variant: plan.tier === "Plus" ? "gold" : "primary" };
    if (currentTier === plan.tier) return { label: "Current plan", disabled: true, variant: "outline" };
    if (plan.tier === "Plus" && currentTier === "Premium") {
      return { label: "Downgrade to Plus", action: () => setDowngradeConfirm(true), variant: "outline" };
    }
    if (plan.tier === "Free") return { label: "—", disabled: true, variant: "outline" };
    return { label: `Upgrade to ${plan.tier}`, action: () => goCheckout(plan), variant: plan.tier === "Plus" ? "gold" : "primary" };
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
    <div className="max-w-6xl mx-auto">
      {/* Hero header */}
      <div className="text-center mb-10">
        <h1 className="font-display text-4xl text-navy mb-3">Choose your plan</h1>
        {sub ? (
          <p className="text-slate-500 text-base max-w-xl mx-auto">
            You are currently on the <strong className="text-navy">{currentTier}</strong> plan
            {sub.subscription?.currentPeriodEnd && (
              <>
                {" "}— {isCancelScheduled ? "access ends" : "next charge"}{" "}
                <strong>{new Date(sub.subscription.currentPeriodEnd).toLocaleDateString()}</strong>
              </>
            )}.
          </p>
        ) : (
          <p className="text-slate-500 text-base max-w-xl mx-auto">
            Source-cited legal answers, document drafting and compliance review — pick the plan that fits.
          </p>
        )}
      </div>

      {/* Cycle toggle + currency, centered */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
        <div className="inline-flex bg-slate-100 rounded-full p-1 relative">
          {(["monthly", "annual"] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={`px-5 py-2 rounded-full text-sm font-semibold capitalize transition-all ${
                cycle === c
                  ? "bg-white text-navy shadow-soft"
                  : "text-slate-500 hover:text-navy"
              }`}
            >
              {c}
              {c === "annual" && maxAnnualSavingsPercent > 0 && (
                <span className="ml-2 inline-block bg-gold text-navy text-[10px] font-extrabold px-1.5 py-0.5 rounded">
                  −{Math.round(maxAnnualSavingsPercent)}%
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-slate-400">Currency</span>
          <select
            className="bg-white border border-slate-200 rounded-full text-sm font-semibold text-navy px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gold hover:border-gold cursor-pointer"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid md:grid-cols-3 gap-5 items-stretch">
        {plans.length === 0 ? (
          <p className="text-slate-400 col-span-3 text-center py-8">Loading plans…</p>
        ) : plans.map((p) => {
          const cta = ctaFor(p);
          const isFeatured = p.tier === "Plus";
          const isCurrent = currentTier === p.tier;
          const monthlyDisplayPrice = cycle === "monthly" ? p.monthly.price : p.annual.price / 12;
          const annualTotal = p.annual.price;
          return (
            <div
              key={p.tier}
              className={`
                relative flex flex-col rounded-2xl p-7 transition-all
                ${isFeatured
                  ? "bg-gradient-to-b from-amber-50 via-white to-white border-2 border-gold shadow-lift md:-mt-4 md:mb-0 z-10"
                  : "bg-white border border-slate-200 shadow-soft hover:shadow-lift hover:-translate-y-0.5"}
                ${isCurrent ? "ring-2 ring-emerald-400 ring-offset-2" : ""}
              `}
            >
              {/* Floating badges */}
              {isFeatured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 bg-gold text-navy text-[11px] font-extrabold px-3 py-1 rounded-full shadow-soft">
                  <Sparkles size={12} /> MOST POPULAR
                </span>
              )}
              {isCurrent && (
                <span className="absolute -top-3 right-5 inline-flex items-center bg-emerald-500 text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full shadow-soft">
                  CURRENT
                </span>
              )}

              {/* Tier name + tagline */}
              <div className="mb-5">
                <h3 className="font-display text-2xl text-navy">{p.displayName}</h3>
                <p className="text-sm text-slate-500 mt-1">{TAGLINES[p.tier] ?? ""}</p>
              </div>

              {/* Price block */}
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-5xl text-navy leading-none">
                    {formatPrice(monthlyDisplayPrice, currency)}
                  </span>
                  <span className="text-sm font-sans font-medium text-slate-500">/mo</span>
                </div>
                {cycle === "annual" && !p.isFree && (
                  <p className="text-xs text-slate-400 mt-2">
                    Billed annually at {formatPrice(annualTotal, currency)}
                    {p.annual.annualSavingsCents > 0 && (
                      <>
                        {" — save "}
                        <span className="font-semibold text-emerald-600">
                          {formatPrice(p.annual.annualSavingsCents / 100, currency)}
                        </span>
                      </>
                    )}
                  </p>
                )}
                {cycle === "monthly" && !p.isFree && (
                  <p className="text-xs text-slate-400 mt-2">Cancel anytime · No setup fee</p>
                )}
                {p.isFree && (
                  <p className="text-xs text-slate-400 mt-2">Forever free · No card required</p>
                )}
              </div>

              {/* Features list */}
              <ul className="space-y-2.5 text-sm flex-1 mb-6">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span className={`mt-0.5 inline-flex w-5 h-5 rounded-full items-center justify-center shrink-0 ${
                      isFeatured ? "bg-gold/20 text-gold-dark" : "bg-emerald-100 text-emerald-700"
                    }`}>
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span className="text-slate-700 leading-snug">{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Button
                full
                variant={cta.variant ?? "primary"}
                disabled={cta.disabled}
                onClick={cta.action}
              >
                {cta.label}
                {!cta.disabled && <ChevronRight size={14} />}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Trust strip */}
      <div className="mt-12 grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
        <TrustItem
          icon={<Shield size={16} className="text-emerald-600" />}
          title="Secure payments"
          body="Processed by Stripe — PCI DSS Level 1 certified. We never see your card."
        />
        <TrustItem
          icon={<Check size={16} className="text-emerald-600" />}
          title="Cancel anytime"
          body="Cancel from My Billing. Access continues until the period ends."
        />
        <TrustItem
          icon={<Sparkles size={16} className="text-emerald-600" />}
          title="Upgrade or downgrade"
          body="Move between Plus and Premium any time. Prorated automatically."
        />
      </div>

      {/* Tax disclaimer */}
      <p className="text-xs text-slate-400 text-center mt-8">
        Prices may include applicable taxes based on your billing address. All currencies show
        the same purchasing tier — your card is charged in {currency}.
      </p>

      <ConfirmModal
        open={downgradeConfirm}
        title="Downgrade to Plus?"
        message="Your Premium features will remain active until the end of the current period. You will not be charged again at the Premium rate."
        confirmText="Confirm downgrade"
        onConfirm={async () => { await downgrade(); setDowngradeConfirm(false); }}
        onClose={() => setDowngradeConfirm(false)}
      />
    </div>
  );
}

const TAGLINES: Record<string, string> = {
  Free: "Try Mindlex with no commitment.",
  Plus: "For professionals who need daily legal answers.",
  Premium: "Full power — drafting, compliance review and Drive."
};

function TrustItem({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex w-8 h-8 rounded-full bg-emerald-50 items-center justify-center shrink-0">
        {icon}
      </span>
      <div>
        <div className="text-sm font-semibold text-navy">{title}</div>
        <p className="text-xs text-slate-500 leading-snug mt-0.5">{body}</p>
      </div>
    </div>
  );
}
