// UM10 + UM11 + UM12 + UM17 — Admin user management
import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Dropdown } from "@/components/ui/Dropdown";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { formatDate } from "@/lib/utils";
import { MoreHorizontal, Download, Search, Users as UsersIcon, Crown, Sparkles, UserX } from "lucide-react";
import type { Role } from "@/types";

interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  dateOfBirth?: string;
  role: Exclude<Role, "Admin"> | "Admin";
  status: "active" | "deactivated" | "deleted";
  lastPaymentDate?: string;
  joinedAt: string;
}

interface AdminUsersResponse {
  users: AdminUser[];
  totalCount: number;
}

interface UserSubscriptionDetail {
  userId: string;
  fullName: string | null;
  email: string;
  currentRole: string;
  subscriptionStatus: "Active" | "Canceled" | "Expired";
  startDate?: string;
  endDate?: string;
  lastPaymentDate?: string;
  nextPaymentDue?: string;
  paymentStatus?: string;
  canCancel: boolean;
  paymentHistory: {
    id: string;
    paidAt: string;
    paidAtDisplay: string;
    subscriptionPlan: string | null;
    amount: number;
    amountDisplay: string;
    currency: string;
    status: string;
    invoiceDownloadUrl: string | null;
  }[];
}

export function AdminUsersPage() {
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("");
  const [roleFor, setRoleFor] = useState<AdminUser | null>(null);
  const [confirmReset, setConfirmReset] = useState<AdminUser | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [confirmDeact, setConfirmDeact] = useState<AdminUser | null>(null);
  const [subFor, setSubFor] = useState<AdminUser | null>(null);
  const showToast = useUiStore((s) => s.showToast);

  const load = () => {
    api.get<AdminUsersResponse | AdminUser[]>("/admin/users")
      .then((r) => {
        const data = r.data;
        if (Array.isArray(data)) setUsers(data);
        else if (data && Array.isArray(data.users)) setUsers(data.users);
      })
      .catch(() => undefined);
  };
  useEffect(() => { load(); }, []);

  const visible = users.filter((u) => {
    if (filterRole && u.role !== filterRole) return false;
    if (search) {
      const s = search.toLowerCase();
      return u.fullName.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
    }
    return true;
  });

  const stats = {
    total: users.length,
    active: users.filter((u) => u.status === "active").length,
    premium: users.filter((u) => u.role === "Premium").length,
    plus: users.filter((u) => u.role === "Plus").length,
    deactivated: users.filter((u) => u.status === "deactivated").length
  };

  const resetPwd = async (u: AdminUser) => {
    try {
      await api.post(`/admin/users/${u.id}/reset-password`);
      showToast("success", "Temporary password has been sent to the user's email address.");
    } catch (e) { showToast("danger", apiError(e)); }
  };

  const setStatus = async (u: AdminUser, status: "deactivated" | "active") => {
    try {
      const ep = status === "deactivated"
        ? `/admin/users/${u.id}/deactivate`
        : `/admin/users/${u.id}/activate`;
      await api.post(ep);
      showToast("success", status === "deactivated" ? "User account deactivated." : "User reactivated.");
      load();
    } catch (e) { showToast("danger", apiError(e)); }
  };

  const remove = async (u: AdminUser) => {
    try {
      const { data } = await api.delete(`/admin/users/${u.id}`);
      showToast("success", "User account deleted.");
      if (data?.mode === "partial") {
        showToast("info", "Some records retained for audit (SR2).");
      }
      load();
    } catch (e) { showToast("danger", apiError(e)); }
  };

  const downloadCsv = async () => {
    try {
      const r = await api.get("/admin/users/download", { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = "users.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch { showToast("danger", "CSV download failed"); }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl text-navy">User management</h1>
          <p className="text-slate-500 text-sm mt-1">
            {stats.total} users · {stats.active} active
          </p>
        </div>
        <Button variant="outline" onClick={downloadCsv}>
          <Download size={14} /> Export CSV
        </Button>
      </div>

      {/* Stat cards with icons */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={<UsersIcon size={18} className="text-navy" />}
          label="Total users"
          value={stats.total}
          bg="bg-slate-50"
        />
        <StatCard
          icon={<Crown size={18} className="text-gold-dark" />}
          label="Premium"
          value={stats.premium}
          bg="bg-amber-50"
        />
        <StatCard
          icon={<Sparkles size={18} className="text-emerald-600" />}
          label="Plus"
          value={stats.plus}
          bg="bg-emerald-50"
        />
        <StatCard
          icon={<UserX size={18} className="text-red-500" />}
          label="Deactivated"
          value={stats.deactivated}
          bg="bg-red-50"
        />
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-soft mb-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input max-w-[180px]"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="">All roles</option>
            <option>Free</option><option>Plus</option><option>Premium</option><option>Admin</option>
          </select>
          <span className="text-xs text-slate-400 ml-auto">
            {visible.length} of {stats.total}
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-soft">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">User</th>
                <th className="text-left px-5 py-3 font-semibold">Plan</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
                <th className="text-left px-5 py-3 font-semibold">Last payment</th>
                <th className="text-left px-5 py-3 font-semibold">Joined</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 text-sm">
                    No users match your search.
                  </td>
                </tr>
              ) : visible.map((u) => {
                const isSelf = u.id === me?.id;
                const initials = (u.fullName ?? "?").split(" ").map(s => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
                return (
                  <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                          u.role === "Admin" ? "bg-gradient-to-br from-navy to-navy-700"
                          : u.role === "Premium" ? "bg-gradient-to-br from-gold to-gold-dark"
                          : "bg-gradient-to-br from-slate-400 to-slate-500"
                        }`}>
                          {initials}
                        </span>
                        <div className="min-w-0">
                          <div className="font-semibold text-navy truncate">
                            {u.fullName} {isSelf && <span className="chip ml-1 text-[10px]">you</span>}
                          </div>
                          <div className="text-xs text-slate-500 truncate">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={
                        u.role === "Admin" ? "chip bg-navy text-gold"
                        : u.role === "Premium" ? "chip-gold"
                        : "chip"
                      }>{u.role}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={
                        u.status === "active" ? "chip-success"
                        : u.status === "deactivated" ? "chip-warn"
                        : "chip-danger"
                      }>{u.status}</span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{u.lastPaymentDate ? formatDate(u.lastPaymentDate) : "—"}</td>
                    <td className="px-5 py-3.5 text-slate-600">{formatDate(u.joinedAt)}</td>
                    <td className="px-5 py-3.5">
                      <RowActions
                        user={u}
                        isSelf={isSelf}
                        onResetPwd={() => setConfirmReset(u)}
                        onRole={() => setRoleFor(u)}
                        onToggle={() => u.status === "active" ? setConfirmDeact(u) : setStatus(u, "active")}
                        onDelete={() => setConfirmDelete(u)}
                        onViewSub={() => setSubFor(u)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <RoleEditModal user={roleFor} onClose={() => setRoleFor(null)} onSaved={load} />
      <UserSubscriptionModal user={subFor} onClose={() => setSubFor(null)} />

      <ConfirmModal
        open={!!confirmReset}
        title="Confirm Password Reset"
        message={`A temporary password will be emailed to ${confirmReset?.email}.`}
        onConfirm={() => confirmReset && resetPwd(confirmReset)}
        onClose={() => setConfirmReset(null)}
      />
      <ConfirmModal
        open={!!confirmDeact}
        title="Deactivate user?"
        message={`${confirmDeact?.fullName} will lose access immediately.`}
        destructive
        onConfirm={() => confirmDeact && setStatus(confirmDeact, "deactivated")}
        onClose={() => setConfirmDeact(null)}
      />
      <ConfirmModal
        open={!!confirmDelete}
        title="Delete user account?"
        message={`This permanently removes ${confirmDelete?.fullName}'s account. Some records may be retained for audit purposes (SR2).`}
        destructive
        confirmText="Delete account"
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
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

function RowActions({
  user, isSelf, onResetPwd, onRole, onToggle, onDelete, onViewSub
}: {
  user: AdminUser;
  isSelf: boolean;
  onResetPwd: () => void;
  onRole: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onViewSub: () => void;
}) {
  if (isSelf) {
    return (
      <button
        type="button"
        disabled
        className="text-slate-300 cursor-not-allowed p-1"
        title="You cannot modify your own account"
      >
        <MoreHorizontal size={16} />
      </button>
    );
  }
  return (
    <Dropdown
      menuLabel={`Actions for ${user.fullName}`}
      trigger={({ toggle, open, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Actions for ${user.fullName}`}
          className="text-slate-400 hover:text-navy hover:bg-slate-100 rounded p-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <MoreHorizontal size={16} />
        </button>
      )}
      items={[
        { key: "view-sub", label: "View subscription", onSelect: onViewSub },
        { key: "reset", label: "Reset password", onSelect: onResetPwd, hidden: user.role === "Admin" },
        { key: "role", label: "Edit role", onSelect: onRole },
        { key: "toggle", label: user.status === "active" ? "Deactivate" : "Activate", onSelect: onToggle },
        { key: "delete", label: "Delete", onSelect: onDelete, danger: true }
      ]}
    />
  );
}

function UserSubscriptionModal({
  user, onClose
}: { user: AdminUser | null; onClose: () => void }) {
  const [detail, setDetail] = useState<UserSubscriptionDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) { setDetail(null); return; }
    setLoading(true);
    api.get<UserSubscriptionDetail>(`/admin/users/${user.id}/subscription`)
      .then((r) => setDetail(r.data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [user]);

  if (!user) return null;

  return (
    <Modal open onClose={onClose} title={`${user.fullName} — subscription`} size="lg">
      {loading && <p className="text-slate-400 text-sm">Loading…</p>}
      {!loading && detail && (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <KV label="Role">{detail.currentRole}</KV>
            <KV label="Status">
              <span className={
                detail.subscriptionStatus === "Active" ? "chip-success"
                : detail.subscriptionStatus === "Canceled" ? "chip-warn"
                : "chip-danger"
              }>{detail.subscriptionStatus}</span>
            </KV>
            {detail.startDate && <KV label="Started">{formatDate(detail.startDate)}</KV>}
            {detail.endDate && <KV label="Ends">{formatDate(detail.endDate)}</KV>}
            {detail.nextPaymentDue && <KV label="Next payment">{formatDate(detail.nextPaymentDue)}</KV>}
            {detail.lastPaymentDate && <KV label="Last payment">{formatDate(detail.lastPaymentDate)}</KV>}
            {detail.paymentStatus && <KV label="Payment status">{detail.paymentStatus}</KV>}
          </div>

          {detail.paymentHistory.length > 0 && (
            <div className="mt-5">
              <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">Payment history</div>
              <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Date</th>
                      <th className="text-left px-3 py-2 font-semibold">Plan</th>
                      <th className="text-left px-3 py-2 font-semibold">Amount</th>
                      <th className="text-left px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.paymentHistory.map((p) => (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">{p.paidAtDisplay}</td>
                        <td className="px-3 py-2">{p.subscriptionPlan ?? "—"}</td>
                        <td className="px-3 py-2 font-semibold">{p.amountDisplay}</td>
                        <td className="px-3 py-2">
                          <span className={p.status === "Paid" ? "chip-success" : "chip-warn"}>{p.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {!loading && !detail && <p className="text-slate-400 text-sm">No subscription data.</p>}
      <div className="flex justify-end mt-5">
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
      <div className="font-medium text-navy mt-0.5">{children}</div>
    </div>
  );
}

function RoleEditModal({
  user, onClose, onSaved
}: { user: AdminUser | null; onClose: () => void; onSaved: () => void }) {
  const [role, setRole] = useState<Exclude<Role, "Admin">>("Plus");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const showToast = useUiStore((s) => s.showToast);

  useEffect(() => {
    if (user) {
      setRole(user.role === "Admin" ? "Plus" : user.role);
      setReason("");
    }
  }, [user]);

  if (!user) return null;

  const save = async () => {
    if (!reason.trim()) { showToast("warn", "Reason is required"); return; }
    if (reason.length > 5000) { showToast("warn", "Reason too long (max 5000)"); return; }
    setBusy(true);
    try {
      await api.put(`/admin/users/${user.id}/role`, { role, reason });
      showToast("success", "User role updated successfully.");
      onSaved(); onClose();
    } catch (e) {
      const status = (e as { response?: { status?: number; data?: { code?: string } } })?.response;
      if (status?.data?.code === "last_active_admin") {
        showToast("danger", "Cannot remove the last admin.");
      } else if (status?.data?.code === "cannot_modify_self") {
        showToast("danger", "You cannot modify your own role.");
      } else {
        showToast("danger", apiError(e));
      }
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Change role for ${user.fullName}`} size="md">
      <div className="mb-4">
        <label className="label">New role</label>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as Exclude<Role, "Admin">)}>
          <option>Free</option><option>Plus</option><option>Premium</option>
        </select>
      </div>
      <div className="mb-4">
        <label className="label">Reason (required, max 5000 characters)</label>
        <textarea
          className="input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Audit-trail reason for this role change…"
        />
        <p className="text-xs text-slate-400 mt-1">{reason.length}/5000 characters</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy}>Save change</Button>
      </div>
    </Modal>
  );
}
