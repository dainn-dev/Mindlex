// UM10 + UM11 + UM12 + UM17 \u2014 Admin user management
import { useEffect, useState } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Dropdown } from "@/components/ui/Dropdown";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { formatDate } from "@/lib/utils";
import { MoreHorizontal, Download } from "lucide-react";
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

export function AdminUsersPage() {
  const me = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("");
  const [roleFor, setRoleFor] = useState<AdminUser | null>(null);
  const [confirmReset, setConfirmReset] = useState<AdminUser | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [confirmDeact, setConfirmDeact] = useState<AdminUser | null>(null);
  const showToast = useUiStore((s) => s.showToast);

  const load = () => {
    api.get<AdminUsersResponse | AdminUser[]>("/admin/users")
      .then((r) => {
        const data = r.data;
        // Backend currently returns { users, totalCount }; tolerate either shape
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
    <div>
      <h1 className="font-display text-2xl text-navy">User Management</h1>
      <p className="text-slate-500 text-sm mb-5">
        {stats.total} users \u00b7 {users.filter((u) => u.status === "active").length} active
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Total users" value={stats.total} />
        <Stat label="Premium" value={stats.premium} />
        <Stat label="Plus" value={stats.plus} />
        <Stat label="Deactivated" value={stats.deactivated} />
      </div>

      <div className="flex gap-2.5 mb-3 flex-wrap">
        <input
          className="input max-w-xs"
          placeholder="Search by name or email\u2026"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input max-w-[160px]" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
          <option value="">All roles</option>
          <option>Free</option><option>Plus</option><option>Premium</option><option>Admin</option>
        </select>
        <Button variant="outline" className="ml-auto" onClick={downloadCsv}>
          <Download size={14} /> Download users CSV
        </Button>
      </div>
      <p className="text-xs text-slate-400 mb-2.5">Download the users' information.</p>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left p-3">Full Name</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Plan</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Last payment</th>
              <th className="text-left p-3">Joined</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {visible.map((u) => {
              const isSelf = u.id === me?.id;
              return (
                <tr key={u.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3">{u.fullName}{isSelf && <span className="chip ml-2">you</span>}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">
                    <span className={u.role === "Premium" ? "chip-gold" : "chip"}>{u.role}</span>
                  </td>
                  <td className="p-3">
                    <span className={
                      u.status === "active" ? "chip-success"
                      : u.status === "deactivated" ? "chip-warn"
                      : "chip-danger"
                    }>{u.status}</span>
                  </td>
                  <td className="p-3">{u.lastPaymentDate ? formatDate(u.lastPaymentDate) : "\u2014"}</td>
                  <td className="p-3">{formatDate(u.joinedAt)}</td>
                  <td className="p-3">
                    <RowActions
                      user={u}
                      isSelf={isSelf}
                      onResetPwd={() => setConfirmReset(u)}
                      onRole={() => setRoleFor(u)}
                      onToggle={() => u.status === "active" ? setConfirmDeact(u) : setStatus(u, "active")}
                      onDelete={() => setConfirmDelete(u)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RoleEditModal user={roleFor} onClose={() => setRoleFor(null)} onSaved={load} />

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

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="font-display text-3xl text-navy">{value}</div>
    </div>
  );
}

function RowActions({
  user, isSelf, onResetPwd, onRole, onToggle, onDelete
}: {
  user: AdminUser;
  isSelf: boolean;
  onResetPwd: () => void;
  onRole: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  if (isSelf) {
    return (
      <button
        type="button"
        disabled
        className="text-slate-300 cursor-not-allowed"
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
          className="text-slate-400 hover:text-navy rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <MoreHorizontal size={16} />
        </button>
      )}
      items={[
        { key: "reset", label: "Reset password", onSelect: onResetPwd, hidden: user.role === "Admin" },
        { key: "role", label: "Edit role", onSelect: onRole },
        { key: "toggle", label: user.status === "active" ? "Deactivate" : "Activate", onSelect: onToggle },
        { key: "delete", label: "Delete", onSelect: onDelete, danger: true }
      ]}
    />
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
      <div className="mb-3">
        <label className="label">New role</label>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as Exclude<Role, "Admin">)}>
          <option>Free</option><option>Plus</option><option>Premium</option>
        </select>
      </div>
      <div className="mb-3">
        <label className="label">Reason (mandatory, max 5000 characters)</label>
        <textarea
          className="input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy}>Save change</Button>
      </div>
    </Modal>
  );
}
