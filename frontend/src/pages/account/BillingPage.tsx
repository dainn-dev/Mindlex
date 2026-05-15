// PB5 + PB6 + PB7 + PB8 + PB12 \u2014 Subscription status + cancel + payment history + refund info
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import { useUiStore } from "@/store/uiStore";
import type { BillingStatus, MySubscription, Payment, PaymentsResponse } from "@/types";
import { Download, CreditCard } from "lucide-react";

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

  return (
    <div>
      <h1 className="font-display text-2xl text-navy">My Billing</h1>
      <p className="text-slate-500 text-sm mb-5">Subscription status and invoice history</p>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="card">
          <h3 className="text-navy mb-3.5">Subscription status</h3>
          {billing ? (
            <div className="space-y-2 text-sm">
              <Row label="Plan">
                <span className="chip-gold">{billing.currentRole}</span>
              </Row>
              <Row label="Status">
                <span className={
                  billing.status === "Canceled" ? "chip-warn"
                  : billing.status === "Expired" ? "chip-danger"
                  : "chip-success"
                }>\u25cf {billing.status}</span>
              </Row>
              {billing.nextPaymentDue && (
                <Row label="Next payment due">{formatDate(billing.nextPaymentDue)}</Row>
              )}
              {billing.lastPaymentDate && (
                <Row label="Last payment">{formatDate(billing.lastPaymentDate)}</Row>
              )}
              {sub?.currentPeriodEnd && sub.cancelAtPeriodEnd && (
                <Row label="Access until">{formatDate(sub.currentPeriodEnd)}</Row>
              )}
              {billing.message && (
                <p className="text-xs text-slate-500 mt-2">{billing.message}</p>
              )}
            </div>
          ) : <p className="text-slate-400 text-sm">Loading\u2026</p>}
          {canCancel && (
            <Button variant="danger" className="mt-4" onClick={() => setConfirmCancel(true)}>
              Cancel subscription
            </Button>
          )}
          {billing?.showUpgradeButton && (
            <Link to="/account/subscription" className="btn-gold mt-4 inline-flex">
              Upgrade
            </Link>
          )}
        </div>

        <div className="card">
          <h3 className="text-navy mb-3.5">Refund info</h3>
          <p className="text-sm text-slate-500">
            Need a refund? Please contact our support team at{" "}
            <a href="mailto:info@mindlex.ai" className="text-navy font-semibold">info@mindlex.ai</a>{" "}
            with your account email and payment details.
          </p>
        </div>
      </div>

      <h3 className="text-navy mt-6 mb-3">Payment history</h3>
      {payments.length === 0 ? (
        <EmptyState
          icon={<CreditCard size={28} className="text-slate-300" />}
          title="No payment history"
          description="Once you subscribe to a paid plan, all invoices will be available for download here."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left p-3">Date</th>
                <th className="text-left p-3">Plan</th>
                <th className="text-left p-3">Amount</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3">{p.paidAtDisplay ?? formatDate(p.paidAt, true)}</td>
                  <td className="p-3">{p.subscriptionPlan ?? "\u2014"}</td>
                  <td className="p-3">{p.amountDisplay}</td>
                  <td className="p-3">
                    <span className={
                      p.status === "Paid" ? "chip-success"
                      : p.status === "Pending" ? "chip-warn"
                      : "chip-danger"
                    }>
                      {p.status}
                    </span>
                  </td>
                  <td className="p-3">
                    {p.isPaid ? (
                      <button onClick={() => downloadInvoice(p)} className="text-navy hover:text-gold" title="Download invoice">
                        <Download size={16} />
                      </button>
                    ) : (
                      <span className="text-slate-300"><Download size={16} /></span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmModal
        open={confirmCancel}
        title="Cancel subscription?"
        message={`You'll keep access until ${sub?.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : "the end of the current period"}. After that, your account will switch to Free.`}
        destructive
        confirmText={busy ? "Canceling\u2026" : "Confirm cancel"}
        cancelText="Go back"
        onConfirm={cancel}
        onClose={() => setConfirmCancel(false)}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div>{children}</div>
    </div>
  );
}
