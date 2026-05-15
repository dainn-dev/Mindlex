// UM7 + UM9 + UM16 + LC6 \u2014 Profile, password, tone, download data, logout
import { FormEvent, useEffect, useState } from "react";
import { Key, Download as DownloadIcon, LogOut } from "lucide-react";
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
    <div>
      <h1 className="font-display text-2xl text-navy">My Account</h1>
      <p className="text-slate-500 text-sm mb-5">Manage your profile and preferences</p>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="card">
          <h3 className="text-navy mb-3.5">Profile</h3>
          <Field label="Email">
            {user?.email} <span className="chip ml-2">view only</span>
          </Field>
          <Field label="Full name">
            <div className="flex justify-between items-center">
              <span>{user?.fullName}</span>
              <Button variant="outline" size="sm" onClick={() => setShowName(true)}>Edit</Button>
            </div>
          </Field>
          <Field label="Date of birth">{user?.dateOfBirth ?? "\u2014"}</Field>
          <Field label="Role">
            <span className="chip-gold">{user?.roles.join(", ")}</span>
          </Field>
        </div>

        <div className="card">
          <h3 className="text-navy mb-3.5">Preferences</h3>
          {canOverrideTone ? (
            <Field label={`Chatbot tone${toneInfo?.overridden ? " (overridden)" : ""}`}>
              <div className="inline-flex bg-slate-100 rounded-full p-1">
                {(["plain", "technical"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => switchTone(opt)}
                    className={`px-3 py-1 rounded-full text-sm capitalize ${
                      (toneInfo?.tone ?? user?.tone) === opt ? "bg-white text-navy shadow-sm" : "text-slate-500"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {toneInfo?.description && (
                <p className="text-xs text-slate-400 mt-1.5">{toneInfo.description}</p>
              )}
            </Field>
          ) : toneInfo ? (
            <Field label="Chatbot tone">
              <span className="capitalize">{toneInfo.tone}</span>
              <p className="text-xs text-slate-400 mt-1">
                Tone override is available on Plus and Premium plans.
              </p>
            </Field>
          ) : null}
          <Button variant="outline" full onClick={() => setShowPwd(true)} className="mb-2.5">
            <Key size={14} /> Change password
          </Button>
          <Button variant="outline" full onClick={downloadMyData} className="mb-2.5">
            <DownloadIcon size={14} /> Download my data (.txt)
          </Button>
          <Button variant="danger" full onClick={() => setConfirmLogout(true)} className="mt-2">
            <LogOut size={14} /> Log out
          </Button>
        </div>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="label">{label}</div>
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
