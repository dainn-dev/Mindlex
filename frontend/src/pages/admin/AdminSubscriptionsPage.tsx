// PB9 — Admin: subscription management
import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useUiStore } from "@/store/uiStore";
import { formatDate } from "@/lib/utils";
import { XCircle, TrendingUp, Crown, Sparkles, Users as UsersIcon } from "lucide-react";

interface AdminSubRow {
  userId: string;
  fullName: string | null;
  email: string;
  dateOfBirth?: string;
  currentRole: string;
  userStatus: string;
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
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-navy">Subscriptions</h1>
        <p className="text-slate-500 text-sm mt-1">
          {activeRows.length} active subscriptions · {rows.length} total accounts
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<TrendingUp size={18} className="text-emerald-600" />}
          label="Active"
          value={activeRows.length}
          bg="bg-emerald-50"
        />
        <StatCard
          icon={<Crown size={18} className="text-gold-dark" />}
          label="Premium"
          value={premiumCount}
          bg="bg-amber-50"
        />
        <StatCard
          icon={<Sparkles size={18} className="text-emerald-600" />}
          label="Plus"
          value={plusCount}
          bg="bg-emerald-50"
        />
        <StatCard
          icon={<XCircle size={18} className="text-amber-500" />}
          label="Canceled"
          value={canceledCount}
          bg="bg-amber-50"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-soft">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-display text-lg text-navy">All subscriptions</h3>
          <span className="text-xs text-slate-400">{rows.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">User</th>
                <th className="text-left px-5 py-3 font-semibold">Plan</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-left px-5 py-3 font-semibold">Account</th>
                <th className="text-left px-5 py-3 font-semibold">DOB</th>
                <th className="w-32 text-right px-5 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 text-sm">
                    <UsersIcon size={28} className="mx-auto text-slate-300 mb-2" />
                    No subscriptions yet.
                  </td>
                </tr>
              ) : rows.map((s) => {
                const initials = (s.fullName ?? s.email).split(" ").map(x => x[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
                const isPremium = s.currentRole.startsWith("Premium");
                return (
                  <tr key={s.userId} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                          isPremium ? "bg-gradient-to-br from-gold to-gold-dark"
                          : "bg-gradient-to-br from-slate-400 to-slate-500"
                        }`}>
                          {initials}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-navy truncate">{s.fullName ?? "—"}</div>
                          <div className="text-xs text-slate-500 truncate">{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={isPremium ? "chip-gold" : "chip"}>{s.currentRole}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={
                        s.subscriptionStatus === "Active" ? "chip-success"
                        : s.subscriptionStatus === "Canceled" ? "chip-warn"
                        : "chip-danger"
                      }>{s.subscriptionStatus}</span>
                    </td>
                    <td className="px-5 py-3.5 capitalize text-slate-600">{s.userStatus.toLowerCase()}</td>
                    <td className="px-5 py-3.5 text-slate-600">{s.dateOfBirth ? formatDate(s.dateOfBirth) : "—"}</td>
                    <td className="px-5 py-3.5 text-right">
                      {s.subscriptionStatus === "Active" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmCancel(s)}
                        >
                          Cancel
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={!!confirmCancel}
        title="Cancel this subscription?"
        message={`${confirmCancel?.fullName ?? confirmCancel?.email}'s ${confirmCancel?.currentRole} subscription will end at the period close. They retain access until then.`}
        destructive
        confirmText="Cancel subscription"
        cancelText="Keep active"
        onConfirm={() => confirmCancel && cancel(confirmCancel)}
        onClose={() => setConfirmCancel(null)}
      />
    </div>
  );
}

function StatCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: number | string; bg: string }) {
  return (
    <div className={`rounded-2xl p-4 border border-slate-200 ${bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex w-8 h-8 rounded-full bg-white items-center justify-center shadow-soft">
          {icon}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</span>
      </div>
      <div className="font-display text-3xl text-navy">{value}</div>
    </div>
  );
}
