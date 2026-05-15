// PB9 \u2014 Admin: subscription management
import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useUiStore } from "@/store/uiStore";
import { formatDate } from "@/lib/utils";
import { MoreHorizontal } from "lucide-react";

/** Matches GET /admin/subscriptions row shape. */
interface AdminSubRow {
  userId: string;
  fullName: string | null;
  email: string;
  dateOfBirth?: string;
  currentRole: string;        // "Plus User" | "Premium User" | "Free User"
  userStatus: string;          // UserStatus enum string
  subscriptionStatus: "Active" | "Canceled" | "Expired";
}

export function AdminSubscriptionsPage() {
  const [rows, setRows] = useState<AdminSubRow[]>([]);
  const [confirmCancel, setConfirmCancel] = useState<AdminSubRow | null>(null);
  const showToast = useUiStore((s) => s.showToast);

  const load = () => api.get<AdminSubRow[]>("/admin/subscriptions")
    .then((r) => setRows(r.data))
    .catch(() => undefined);
  useEffect(() => { load(); }, []);

  const cancel = async (row: AdminSubRow) => {
    try {
      await api.post(`/admin/users/${row.userId}/cancel-subscription`);
      showToast("success", "Subscription canceled");
      load();
    } catch (e) { showToast("danger", apiError(e)); }
  };

  const activeRows = rows.filter((s) => s.subscriptionStatus === "Active");
  const premiumCount = activeRows.filter((s) => s.currentRole.startsWith("Premium")).length;
  const plusCount = activeRows.filter((s) => s.currentRole.startsWith("Plus")).length;
  const canceledCount = rows.filter((s) => s.subscriptionStatus === "Canceled").length;

  return (
    <div>
      <h1 className="font-display text-2xl text-navy">Subscription Management</h1>
      <p className="text-slate-500 text-sm mb-5">
        {activeRows.length} active subscriptions
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="card"><div className="label">Active</div><div className="font-display text-3xl text-navy">{activeRows.length}</div></div>
        <div className="card"><div className="label">Premium</div><div className="font-display text-3xl text-navy">{premiumCount}</div></div>
        <div className="card"><div className="label">Plus</div><div className="font-display text-3xl text-navy">{plusCount}</div></div>
        <div className="card"><div className="label">Canceled</div><div className="font-display text-3xl text-navy">{canceledCount}</div></div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left p-3">User</th>
              <th className="text-left p-3">Plan</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">User status</th>
              <th className="text-left p-3">DOB</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.userId} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3">
                  <strong>{s.fullName ?? "\u2014"}</strong>
                  <div className="text-[11px] text-slate-400">{s.email}</div>
                </td>
                <td className="p-3">
                  <span className={s.currentRole.startsWith("Premium") ? "chip-gold" : "chip"}>
                    {s.currentRole}
                  </span>
                </td>
                <td className="p-3">
                  <span className={
                    s.subscriptionStatus === "Active" ? "chip-success"
                    : s.subscriptionStatus === "Canceled" ? "chip-warn"
                    : "chip-danger"
                  }>{s.subscriptionStatus}</span>
                </td>
                <td className="p-3 capitalize">{s.userStatus.toLowerCase()}</td>
                <td className="p-3">{s.dateOfBirth ? formatDate(s.dateOfBirth) : "\u2014"}</td>
                <td className="p-3">
                  {s.subscriptionStatus === "Active" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmCancel(s)}
                      aria-label="Cancel subscription"
                      className="text-slate-400 hover:text-navy"
                    >
                      <MoreHorizontal size={16} />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={!!confirmCancel}
        title="Cancel this subscription?"
        message={`${confirmCancel?.fullName ?? confirmCancel?.email}'s ${confirmCancel?.currentRole} subscription will end at the period close.`}
        destructive
        confirmText="Cancel subscription"
        cancelText="Go back"
        onConfirm={() => confirmCancel && cancel(confirmCancel)}
        onClose={() => setConfirmCancel(null)}
      />
    </div>
  );
}
