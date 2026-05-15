// LC8 \u2014 Chat history threads sidebar
import { useEffect, useState } from "react";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useUiStore } from "@/store/uiStore";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Dropdown } from "@/components/ui/Dropdown";
import { MobileDrawer } from "@/components/ui/MobileDrawer";
import type { ChatThread } from "@/types";

interface Props {
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function ChatSidebar({ activeId, onSelect, onNew, mobileOpen, onMobileClose }: Props) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const showToast = useUiStore((s) => s.showToast);

  const reload = () => {
    api.get<ChatThread[]>("/chat/threads")
      .then((r) => setThreads(r.data))
      .catch(() => undefined);
  };

  useEffect(() => { reload(); }, []);

  const rename = async (id: string) => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed.length > 30) {
      showToast("warn", "Title must be 1\u201330 characters.");
      return;
    }
    try {
      await api.patch(`/chat/threads/${id}`, { title: trimmed });
      reload();
      setEditingId(null);
    } catch {
      showToast("danger", "Rename failed");
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/chat/threads/${id}`);
      reload();
      if (activeId === id) onNew();
    } catch {
      showToast("danger", "Delete failed");
    }
  };

  const handleSelect = (id: string) => {
    onSelect(id);
    onMobileClose?.();
  };

  const handleNew = () => {
    onNew();
    onMobileClose?.();
  };

  const groups = groupByRecency(threads);

  const body = (
    <>
      <button type="button" onClick={handleNew} className="btn-primary w-full btn-sm mb-3">
        <Plus size={14} /> New chat
      </button>
      {threads.length === 0 && (
        <div className="text-center text-slate-400 text-xs py-10">
          No conversations yet
        </div>
      )}
      {Object.entries(groups).map(([label, items]) => (
        <div key={label}>
          <div className="text-[10px] uppercase tracking-wider text-slate-400 px-2 py-1.5">
            {label}
          </div>
          {items.map((t) => (
            <div
              key={t.id}
              className={`group px-2.5 py-2 rounded-md mb-0.5 cursor-pointer relative ${
                activeId === t.id ? "bg-slate-100" : "hover:bg-slate-50"
              }`}
              onClick={() => editingId !== t.id && handleSelect(t.id)}
            >
              {editingId === t.id ? (
                <input
                  autoFocus
                  className="w-full text-sm border border-gold rounded px-1.5"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => rename(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") rename(t.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
              ) : (
                <>
                  <div className="text-sm font-medium text-slate-700 truncate pr-6">
                    {t.title}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {new Date(t.lastMessageAt).toLocaleString()}
                  </div>
                  <ThreadMenu
                    onRename={() => { setEditingId(t.id); setEditValue(t.title); }}
                    onDelete={() => setConfirmDelete(t.id)}
                  />
                </>
              )}
            </div>
          ))}
        </div>
      ))}
    </>
  );

  return (
    <>
      <aside className="bg-white border-r border-slate-200 p-3 overflow-y-auto w-60 hidden md:block">
        {body}
      </aside>
      <MobileDrawer
        open={!!mobileOpen}
        onClose={onMobileClose ?? (() => undefined)}
        title="Conversations"
      >
        {body}
      </MobileDrawer>
      {/* Single ConfirmModal hoisted out of `body` so it does not render twice (desktop aside + mobile drawer). */}
      <ConfirmModal
        open={!!confirmDelete}
        title="Delete this conversation?"
        message="This action cannot be undone."
        destructive
        confirmText="Delete"
        onConfirm={() => confirmDelete && remove(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
      />
    </>
  );
}

function ThreadMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  return (
    <div className="absolute right-1.5 top-1.5" onClick={(e) => e.stopPropagation()}>
      <Dropdown
        width="w-32"
        menuLabel="Thread actions"
        trigger={({ toggle, open, ref }) => (
          <button
            ref={ref}
            type="button"
            onClick={(e) => { e.stopPropagation(); toggle(); }}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Thread actions"
            className={`text-slate-400 hover:text-navy p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
              open ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            }`}
          >
            <MoreHorizontal size={14} />
          </button>
        )}
        items={[
          { key: "rename", label: "Rename", icon: Pencil, onSelect: onRename },
          { key: "delete", label: "Delete", icon: Trash2, onSelect: onDelete, danger: true }
        ]}
      />
    </div>
  );
}

function groupByRecency(threads: ChatThread[]) {
  const today: ChatThread[] = [];
  const yesterday: ChatThread[] = [];
  const earlier: ChatThread[] = [];
  const now = new Date();
  threads.forEach((t) => {
    const d = new Date(t.lastMessageAt);
    const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 1) today.push(t);
    else if (diff < 2) yesterday.push(t);
    else earlier.push(t);
  });
  const out: Record<string, ChatThread[]> = {};
  if (today.length) out["Today"] = today;
  if (yesterday.length) out["Yesterday"] = yesterday;
  if (earlier.length) out["Earlier"] = earlier;
  return out;
}
