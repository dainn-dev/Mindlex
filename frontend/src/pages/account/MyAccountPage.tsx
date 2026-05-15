// UM7 + UM9 + UM16 + LC6 — Profile, password, tone, download data, logout
import { FormEvent, useEffect, useState } from "react";
import { Key, Download as DownloadIcon, LogOut, User as UserIcon, Mail, Calendar, Shield } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { validators } from "@/lib/utils";
import type { ChatToneInfo, Tone } from "@/types";

export function MyAccountPage() {
  const user = useAuthStore((s) => s.user);
  const setTone = useAuthStore((s) => s.setTone);
  const logout = useAuthStore((s) => s.logout);
  const refresh = useAuthStore((s) => s.refreshUser);
  const showToast = useUiStore((s) => s.showToast);

  const [showName, setShowName] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [toneInfo, setToneInfo] = useState<ChatToneInfo | null>(null);

  useEffect(() => {
    api.get<ChatToneInfo>("/chat/tone")
      .then((r) => setToneInfo(r.data))
      .catch(() => undefined);
  }, []);

  const canOverrideTone = toneInfo?.manualOverrideAvailable ?? false;
  const initials = (user?.fullName ?? "?").split(" ").map(s => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const downloadMyData = async () => {
    try {
      const r = await api.get("/profile/download", { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = "account_info.txt"; a.click();
      URL.revokeObjectURL(url);
      showToast("success", "Download started");
    } catch { showToast("danger", "Could not download data"); }
  };

  const switchTone = async (newTone: Tone) => {
    setTone(newTone);
    try {
      await api.put("/chat/tone", { tone: newTone });
      setToneInfo((info) => info && {
        ...info,
        tone: newTone,
        overridden: newTone !== info.defaultTone
      });
    } catch (e) {
      showToast("danger", apiError(e));
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-navy">My account</h1>
        <p className="text-slate-500 text-sm mt-1">Manage your profile, preferences and data.</p>
      </div>

      {/* === Profile hero === */}
      <div className="bg-gradient-to-br from-white to-cream border border-slate-200 rounded-2xl p-6 mb-6 shadow-soft">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gold to-gold-dark text-white font-display text-3xl flex items-center justify-center shadow-soft shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-2xl text-navy truncate">{user?.fullName ?? "—"}</h2>
            <p className="text-sm text-slate-500 truncate">{user?.email}</p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {user?.roles.map((r) => (
                <span key={r} className={r === "Admin" ? "chip bg-navy text-gold" : r === "Premium" ? "chip-gold" : "chip"}>
                  {r}
                </span>
              ))}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowName(true)}>Edit name</Button>
        </div>
      </div>

      {/* === Profile details + Preferences side by side === */}
      <div className="grid md:grid-cols-2 gap-5 mb-6">
        <div className="card">
          <h3 className="font-display text-lg text-navy mb-4">Profile details</h3>
          <Field icon={<Mail size={14} />} label="Email">
            <span className="text-slate-700">{user?.email}</span>
            <span className="chip ml-2 text-[10px]">View only</span>
          </Field>
          <Field icon={<UserIcon size={14} />} label="Full name">
            <span className="text-slate-700">{user?.fullName}</span>
          </Field>
          <Field icon={<Calendar size={14} />} label="Date of birth">
            <span className="text-slate-700">{user?.dateOfBirth ?? "—"}</span>
          </Field>
          <Field icon={<Shield size={14} />} label="Plan">
            <span className="chip-gold">{user?.roles[0] ?? "Free"}</span>
          </Field>
        </div>

        <div className="card">
          <h3 className="font-display text-lg text-navy mb-4">Preferences</h3>
          {toneInfo && canOverrideTone && (
            <div className="mb-5">
              <div className="flex items-baseline justify-between mb-2">
                <span className="label !mb-0">Chatbot tone</span>
                {toneInfo.overridden && (
                  <span className="text-[10px] uppercase tracking-wider text-gold-dark font-semibold">Overridden</span>
                )}
              </div>
              <div className="inline-flex bg-slate-100 rounded-full p-1">
                {(["plain", "technical"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => switchTone(opt)}
                    className={`px-4 py-1.5 rounded-full text-sm capitalize transition-all ${
                      (toneInfo?.tone ?? user?.tone) === opt
                        ? "bg-white text-navy shadow-soft font-semibold"
                        : "text-slate-500 hover:text-navy"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">{toneInfo.description}</p>
            </div>
          )}
          {toneInfo && !canOverrideTone && (
            <div className="mb-5">
              <div className="label">Chatbot tone</div>
              <p className="text-sm text-slate-700 capitalize">{toneInfo.tone}</p>
              <p className="text-xs text-slate-400 mt-1">Tone override is available on Plus and Premium plans.</p>
            </div>
          )}

          <div className="space-y-2.5">
            <Button variant="outline" full onClick={() => setShowPwd(true)}>
              <Key size={14} /> Change password
            </Button>
            <Button variant="outline" full onClick={downloadMyData}>
              <DownloadIcon size={14} /> Download my data
            </Button>
          </div>
        </div>
      </div>

      {/* === Danger zone === */}
      <div className="border border-red-200 bg-red-50/40 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold text-navy">Sign out</h4>
          <p className="text-xs text-slate-500 mt-0.5">End your current session on this device.</p>
        </div>
        <Button variant="danger" onClick={() => setConfirmLogout(true)}>
          <LogOut size={14} /> Log out
        </Button>
      </div>

      <EditNameModal open={showName} onClose={() => setShowName(false)} onSaved={refresh} initial={user?.fullName ?? ""} />
      <ChangePasswordModal open={showPwd} onClose={() => setShowPwd(false)} onSaved={() => { setShowPwd(false); logout(); }} />
      <ConfirmModal
        open={confirmLogout}
        title="Are you sure you want to log out?"
        message="You'll need to sign in again to access your dashboard."
        confirmText="Yes, log out"
        onConfirm={logout}
        onClose={() => setConfirmLogout(false)}
      />
    </div>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
        {icon} {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function EditNameModal({
  open, onClose, onSaved, initial
}: { open: boolean; onClose: () => void; onSaved: () => void; initial: string }) {
  const [name, setName] = useState(initial);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const showToast = useUiStore((s) => s.showToast);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name.length > 50) {
      setErr("Required, max 50 characters.");
      return;
    }
    setBusy(true);
    try {
      await api.put("/profile/name", { fullName: name });
      showToast("success", "Name updated");
      onSaved(); onClose();
    } catch (e2) { setErr(apiError(e2)); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Edit full name">
      <form onSubmit={save}>
        <Input value={name} onChange={(e) => setName(e.target.value)} error={err} label="Full name" />
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

function ChangePasswordModal({
  open, onClose, onSaved
}: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [cur, setCur] = useState(""); const [nw, setNw] = useState(""); const [cf, setCf] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const showToast = useUiStore((s) => s.showToast);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const x: Record<string, string> = {};
    if (!cur) x.cur = "Required";
    if (!validators.password(nw)) x.nw = "Must be 8+ chars with 1 number and 1 symbol.";
    if (nw !== cf) x.cf = "Passwords do not match.";
    setErrs(x);
    if (Object.keys(x).length) return;
    setBusy(true);
    try {
      await api.post("/profile/change-password", { currentPassword: cur, newPassword: nw });
      showToast("success", "Password changed. Please sign in again.");
      onSaved();
    } catch (e2) { setErrs({ cur: apiError(e2) }); }
    finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Change password">
      <form onSubmit={save}>
        <Input type="password" label="Current password" value={cur}
          onChange={(e) => setCur(e.target.value)} error={errs.cur} />
        <Input type="password" label="New password" value={nw}
          onChange={(e) => setNw(e.target.value)} error={errs.nw} />
        <Input type="password" label="Confirm new password" value={cf}
          onChange={(e) => setCf(e.target.value)} error={errs.cf} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>Change</Button>
        </div>
      </form>
    </Modal>
  );
}
