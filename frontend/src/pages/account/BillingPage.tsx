// PB5 + PB6 + PB7 + PB8 + PB12 — Subscription status + cancel + payment history + refund info
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, XCircle, Download, CreditCard, Mail, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import { useUiStore } from "@/store/uiStore";
import type { BillingStatus, MySubscription, Payment, PaymentsResponse } from "@/types";

const STATUS_META: Record<string, { Icon: typeof CheckCircle2; color: string; chip: string; bg: string }> = {
  Active:   { Icon: CheckCircle2,  color: "text-emerald-600", chip: "chip-success", bg: "bg-emerald-50 border-emerald-200" },
  Canceled: { Icon: AlertTriangle, color: "text-amber-600",   chip: "chip-warn",    bg: "bg-amber-50 border-amber-200" },
  Expired:  { Icon: XCircle,       color: "text-red-500",     chip: "chip-danger",  bg: "bg-red-50 border-red-200" }
};

export function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [mySub, setMySub] = useState<MySubscription | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const showToast = useUiStore((s) => s.showToast);

  const load = () => {
    api.get<BillingStatus>("/billing/status").then((r) => setBilling(r.data)).catch(() => undefined);
    api.get<MySubscription>("/subscriptions/me").then((r) => setMySub(r.data)).catch(() => undefined);
    api.get<PaymentsResponse>("/billing/payments")
      .then((r) => setPayments(r.data?.payments ?? []))
      .catch(() => undefined);
  };
  useEffect(() => { load(); }, []);

  const cancel = async () => {
    setBusy(true);
    try {
      await api.post("/subscriptions/cancel");
      const endDate = mySub?.subscription?.currentPeriodEnd;
      showToast("success",
        `Your subscription is canceled. You will retain access until ${endDate ? formatDate(endDate) : "the end of period"}.`);
      load();
    } catch { showToast("danger", "Cancel failed"); }
    finally { setBusy(false); }
  };

  const downloadInvoice = async (p: Payment) => {
    try {
      const r = await api.get(`/billing/payments/${p.id}/invoice-pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = `Invoice_${p.id}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { showToast("danger", "Could not download invoice"); }
  };

  const sub = mySub?.subscription;
  const canCancel = billing?.status === "Active"
    && !!sub
    && !sub.cancelAtPeriodEnd
    && mySub?.currentTier !== "Free";
  const meta = billing ? (STATUS_META[billing.status] ?? STATUS_META.Active) : null;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-navy">Billing & invoices</h1>
        <p className="text-slate-500 text-sm mt-1">Track your subscription status and download invoices.</p>
      </div>

      {/* === Status hero card === */}
      {billing && meta && (
        <div className={`rounded-2xl border p-6 ${meta.bg} mb-6 flex items-start gap-4`}>
          <div className="shrink-0">
            <meta.Icon size={32} className={meta.color} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h2 className="font-display text-xl text-navy">{billing.currentRole}</h2>
              <span className={meta.chip}>{billing.status}</span>
              {sub?.cancelAtPeriodEnd && (
                <span className="chip-warn">Cancels at period end</span>
              )}
            </div>
            <div className="text-sm text-slate-600 space-y-1 mt-2">
              {billing.nextPaymentDue && (
                <div>Next charge: <strong className="text-navy">{formatDate(billing.nextPaymentDue)}</strong></div>
              )}
              {billing.lastPaymentDate && (
                <div>Last payment: <strong className="text-navy">{formatDate(billing.lastPaymentDate)}</strong></div>
              )}
              {sub?.currentPeriodEnd && sub.cancelAtPeriodEnd && (
                <div>Access until: <strong className="text-navy">{formatDate(sub.currentPeriodEnd)}</strong></div>
              )}
              {billing.message && (
                <div className="text-slate-500 italic">{billing.message}</div>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {canCancel && (
                <Button variant="outline" size="sm" onClick={() => setConfirmCancel(true)}>
                  Cancel subscription
                </Button>
              )}
              {billing.showUpgradeButton && (
                <Link to="/account/subscription" className="btn-gold btn-sm inline-flex items-center gap-1">
                  <Sparkles size={14} /> Upgrade
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
      {!billing && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 mb-6 text-slate-400 text-sm">
          Loading subscription status…
        </div>
      )}

      {/* === Two-col secondary === */}
      <div className="grid md:grid-cols-3 gap-5 mb-8">
        <InfoCard
          icon={<Mail size={18} className="text-navy" />}
          title="Need a refund?"
          body={<>Contact <a href="mailto:info@mindlex.ai" className="text-navy font-semibold underline decoration-gold underline-offset-2">info@mindlex.ai</a> with your account email and payment ref.</>}
        />
        <InfoCard
          icon={<CreditCard size={18} className="text-navy" />}
          title="Payment method"
          body="Manage your card directly through Stripe's secure portal. Click any invoice below to view via Stripe."
        />
        <InfoCard
          icon={<Sparkles size={18} className="text-navy" />}
          title="Switch plan"
          body={<Link to="/account/subscription" className="text-navy font-semibold hover:underline">Browse plans →</Link>}
        />
      </div>

      {/* === Payment history === */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-soft">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-display text-lg text-navy">Payment history</h3>
          <span className="text-xs text-slate-400">{payments.length} {payments.length === 1 ? "record" : "records"}</span>
        </div>
        {payments.length === 0 ? (
          <EmptyState
            icon={<CreditCard size={28} className="text-slate-300" />}
            title="No payment history yet"
            description="Once you subscribe to a paid plan, all invoices will appear here for download."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Date</th>
                  <th className="text-left px-5 py-3 font-semibold">Plan</th>
                  <th className="text-left px-5 py-3 font-semibold">Amount</th>
                  <th className="text-left px-5 py-3 font-semibold">Status</th>
                  <th className="text-right px-5 py-3 font-semibold">Invoice</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="text-navy">{p.paidAtDisplay ?? formatDate(p.paidAt, true)}</div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{p.subscriptionPlan ?? "—"}</td>
                    <td className="px-5 py-3.5 font-semibold text-navy">{p.amountDisplay}</td>
                    <td className="px-5 py-3.5">
                      <span className={
                        p.status === "Paid" ? "chip-success"
                        : p.status === "Pending" ? "chip-warn"
                        : "chip-danger"
                      }>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {p.isPaid ? (
                        <button
                          type="button"
                          onClick={() => downloadInvoice(p)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-navy hover:text-gold rounded px-2 py-1 hover:bg-slate-50"
                          title="Download invoice PDF"
                        >
                          <Download size={14} /> PDF
                        </button>
                      ) : (
                        <span className="text-slate-300 inline-flex items-center gap-1 text-xs"><Download size={14} /> N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmCancel}
        title="Cancel subscription?"
        message={`You'll keep access until ${sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : "the end of the current period"}. After that, your account will switch to Free.`}
        destructive
        confirmText={busy ? "Canceling…" : "Confirm cancel"}
        cancelText="Keep subscription"
        onConfirm={cancel}
        onClose={() => setConfirmCancel(false)}
      />
    </div>
  );
}

function InfoCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-soft hover:shadow-lift transition-shadow">
      <div className="flex items-center gap-2.5 mb-2">
        <span className="inline-flex w-9 h-9 rounded-full bg-slate-100 items-center justify-center">{icon}</span>
        <h4 className="font-semibold text-navy">{title}</h4>
      </div>
      <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
    </div>
  );
}
