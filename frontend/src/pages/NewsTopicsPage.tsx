// LU1 + LU2 — Topic selection (Premium)
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useUiStore } from "@/store/uiStore";
import { Newspaper, Settings } from "lucide-react";

export function NewsTopicsPage() {
  const [available, setAvailable] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [canEdit, setCanEdit] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const showToast = useUiStore((s) => s.showToast);

  useEffect(() => {
    api.get("/news/topics").then((r) => {
      setAvailable(r.data.available ?? []);
      setSelected(new Set(r.data.selected ?? []));
      setCanEdit(r.data.canEdit ?? true);
    }).catch(() => undefined);
  }, []);

  const toggle = (t: string) => {
    if (!canEdit) return;
    const next = new Set(selected);
    next.has(t) ? next.delete(t) : next.add(t);
    setSelected(next);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/news/topics", { topics: Array.from(selected) });
      showToast("success", "Topic preferences updated successfully");
    } catch {
      showToast("danger", "Could not save topics");
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    try {
      await api.put("/news/topics", { topics: [] });
      setSelected(new Set());
      showToast("success", "Topic preferences updated successfully");
    } catch {
      showToast("danger", "Could not clear topics");
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-[230px_1fr] min-h-[calc(100vh-64px)]">
      <aside className="bg-white border-r border-slate-200 p-4 hidden md:block">
        <div className="text-xs font-semibold uppercase text-slate-400 px-2.5 py-2 tracking-wider">
          News
        </div>
        <Link to="/news" className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm hover:bg-slate-100">
          <Newspaper size={14} /> Feed
        </Link>
        <Link to="/news/topics" className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm bg-navy text-white">
          <Settings size={14} /> Topics
        </Link>
      </aside>
      <main className="p-4 md:p-7">
        <h1 className="font-display text-2xl text-navy">Your topic interests</h1>
        <p className="text-slate-500 text-sm mb-5">
          Pick up to 10 topics \u2014 your feed adapts in real time.
        </p>
        {!canEdit && (
          <div className="bg-amber-50 border border-amber-200 text-navy p-3.5 rounded-md text-sm mb-5">
            <strong>Premium feature</strong> \u2014 Free users see the default Cyprus law feed.
          </div>
        )}
        <div className="flex flex-wrap gap-2.5 max-w-2xl">
          {available.map((t) => (
            <button
              key={t}
              onClick={() => toggle(t)}
              disabled={!canEdit}
              className={
                selected.has(t)
                  ? "chip-gold cursor-pointer"
                  : "chip cursor-pointer"
              }
            >
              {t} {selected.has(t) && "\u2713"}
            </button>
          ))}
        </div>
        <div className="mt-6 flex gap-2.5">
          <Button onClick={save} disabled={busy || !canEdit}>Save interests</Button>
          <Button variant="outline" onClick={() => setConfirmClear(true)} disabled={!canEdit}>
            Clear all
          </Button>
        </div>
        <ConfirmModal
          open={confirmClear}
          title="Remove All Selected Topics?"
          message="Your feed will revert to the default Cyprus law selection."
          destructive
          confirmText="Confirm clear"
          onConfirm={clearAll}
          onClose={() => setConfirmClear(false)}
        />
      </main>
    </div>
  );
}
