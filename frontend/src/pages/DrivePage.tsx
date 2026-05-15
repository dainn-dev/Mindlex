// CM1 + CM2 + CM3 + CM4 + DA2 — My Drive
import { useEffect, useRef, useState } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { useUiStore } from "@/store/uiStore";
import { formatBytes, formatDate } from "@/lib/utils";
import type { DocFile } from "@/types";
import { Upload, MoreHorizontal, Trash2, Pencil, Tag, Share2, Download, FolderOpen, Users, Trash, Menu, FileText } from "lucide-react";
import { MobileDrawer } from "@/components/ui/MobileDrawer";

const ALL_TAGS = ["GDPR", "NDA", "Contract", "Policy", "Tax", "Employment"];
const MAX_FILES = 5;
const MAX_SIZE = 25 * 1024 * 1024;
const QUOTA = 500 * 1024 * 1024;

export function DrivePage() {
  const [files, setFiles] = useState<DocFile[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareFor, setShareFor] = useState<DocFile | null>(null);
  const [renameFor, setRenameFor] = useState<DocFile | null>(null);
  const [tagsFor, setTagsFor] = useState<DocFile | null>(null);
  const [deleteFor, setDeleteFor] = useState<DocFile | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const showToast = useUiStore((s) => s.showToast);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = () => {
    const q = filter ? `?tag=${encodeURIComponent(filter)}` : "";
    api.get<DocFile[]>(`/documents${q}`).then((r) => setFiles(r.data)).catch(() => undefined);
  };

  useEffect(() => { reload(); }, [filter]);

  const onUpload = async (selected: FileList | null) => {
    if (!selected || selected.length === 0) return;
    if (selected.length > MAX_FILES) {
      showToast("danger", `Maximum ${MAX_FILES} files per upload.`);
      return;
    }
    for (const f of Array.from(selected)) {
      if (f.size > MAX_SIZE) {
        showToast("danger", `${f.name} exceeds 25 MB limit.`);
        return;
      }
    }
    setBusy(true);
    const fd = new FormData();
    Array.from(selected).forEach((f) => fd.append("files", f));
    try {
      const { data } = await api.post("/documents/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      data?.uploaded?.forEach((u: { fileName: string; anonymization?: { notice?: string } }) => {
        if (u.anonymization?.notice) showToast("info", u.anonymization.notice);
      });
      showToast("success", `${selected.length} file(s) uploaded.`);
      reload();
    } catch (e) {
      showToast("danger", apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const visibleFiles = files.filter(
    (f) => !search || f.fileName.toLowerCase().includes(search.toLowerCase())
  );
  const used = files.reduce((sum, f) => sum + f.sizeBytes, 0);
  const usedPct = Math.round((used / QUOTA) * 100);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[230px_1fr] min-h-[calc(100vh-64px)]">
      <aside className="bg-white border-r border-slate-200 p-4 hidden md:block">
        <div className="text-xs font-semibold uppercase text-slate-400 px-2.5 py-2 tracking-wider">
          Drive
        </div>
        <DriveNav />
      </aside>

      <div className="md:hidden flex items-center border-b border-slate-200 bg-white px-4 py-2">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open drive menu"
          className="flex items-center gap-2 text-sm text-navy font-semibold rounded p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <Menu size={18} /> Drive
        </button>
      </div>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Drive">
        <DriveNav />
      </MobileDrawer>

      <main className="p-4 md:p-7">
        <h1 className="font-display text-2xl text-navy">My Drive</h1>
        <p className="text-slate-500 text-sm mb-5">
          {files.length} files · {formatBytes(used)} of {formatBytes(QUOTA)} used
        </p>

        <div
          onDrop={(e) => { e.preventDefault(); onUpload(e.dataTransfer.files); }}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500 bg-slate-50 mb-5"
        >
          <Upload size={28} className="text-gold mx-auto mb-2" />
          Drag &amp; drop files here, or{" "}
          <button onClick={() => fileInput.current?.click()} className="text-navy font-semibold underline">
            browse
          </button>{" "}
          · Max 5 files, 25 MB each
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".docx,.doc,.pdf,.txt"
            className="hidden"
            onChange={(e) => onUpload(e.target.files)}
          />
        </div>

        <div className="flex gap-2.5 items-center mb-3.5 flex-wrap">
          <input
            className="input max-w-xs"
            placeholder="Search files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="input max-w-xs"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All tags</option>
            {ALL_TAGS.map((t) => <option key={t}>{t}</option>)}
          </select>
          {filter && (
            <Button variant="ghost" size="sm" onClick={() => setFilter("")}>
              Clear filter
            </Button>
          )}
          <div className="flex-1 max-w-xs bg-slate-100 rounded-full h-2 overflow-hidden ml-auto">
            <div
              className="bg-gradient-to-r from-gold to-gold-dark h-full"
              style={{ width: `${Math.min(usedPct, 100)}%` }}
            />
          </div>
          <span className="text-xs text-slate-500">
            {formatBytes(used)} / {formatBytes(QUOTA)}
          </span>
        </div>

        {visibleFiles.length === 0 && !busy ? (
          <EmptyState
            icon={<FolderOpen size={28} className="text-slate-400" />}
            title="Your Drive is empty"
            description="Upload your first document to start tagging, sharing and running compliance checks."
            action={
              <Button onClick={() => fileInput.current?.click()}>
                <Upload size={14} /> Upload a document
              </Button>
            }
          />
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Tags</th>
                  <th className="text-left p-3">Size</th>
                  <th className="text-left p-3">Modified</th>
                  <th className="text-left p-3">Source</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {visibleFiles.map((f) => (
                  <tr key={f.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-3">
                      <span className="inline-flex items-center gap-2 font-semibold">
                        <FileText size={14} className="text-slate-400" /> {f.fileName}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 flex-wrap">
                        {f.tags.map((t) => <span key={t} className="chip">{t}</span>)}
                      </div>
                    </td>
                    <td className="p-3">{f.sizeDisplay ?? formatBytes(f.sizeBytes)}</td>
                    <td className="p-3">{formatDate(f.lastModifiedAt)}</td>
                    <td className="p-3">
                      <span className={f.source === "shared" ? "chip-warn" : "chip-success"}>
                        {f.source}
                      </span>
                    </td>
                    <td className="p-3">
                      <RowMenu
                        file={f}
                        onRename={() => setRenameFor(f)}
                        onTags={() => setTagsFor(f)}
                        onShare={() => setShareFor(f)}
                        onDelete={() => setDeleteFor(f)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <ShareModal file={shareFor} onClose={() => setShareFor(null)} onSent={reload} />
        <RenameModal file={renameFor} onClose={() => setRenameFor(null)} onDone={reload} />
        <TagsModal file={tagsFor} onClose={() => setTagsFor(null)} onDone={reload} />
        <ConfirmModal
          open={!!deleteFor}
          title={`Delete ${deleteFor?.fileName}?`}
          message="This action cannot be undone."
          destructive
          confirmText="Delete"
          onConfirm={async () => {
            if (!deleteFor) return;
            try {
              await api.delete(`/documents/${deleteFor.id}`);
              showToast("success", "File deleted");
              reload();
            } catch { showToast("danger", "Delete failed"); }
          }}
          onClose={() => setDeleteFor(null)}
        />
      </main>
    </div>
  );
}

function DriveNav() {
  return (
    <>
      <button
        type="button"
        aria-current="page"
        className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-md text-sm bg-navy text-white"
      >
        <FolderOpen size={16} /> My files
      </button>
      <button
        type="button"
        disabled
        title="Coming soon"
        className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-400 cursor-not-allowed"
      >
        <Users size={16} /> Shared with me
      </button>
      <button
        type="button"
        disabled
        title="Coming soon"
        className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-slate-400 cursor-not-allowed"
      >
        <Trash size={16} /> Trash
      </button>
    </>
  );
}

function RowMenu({
  file, onRename, onTags, onShare, onDelete
}: { file: DocFile; onRename: () => void; onTags: () => void; onShare: () => void; onDelete: () => void }) {
  const download = async () => {
    try {
      const r = await api.get(`/documents/${file.id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = file.fileName; a.click();
      URL.revokeObjectURL(url);
    } catch { /* noop */ }
  };
  const isOwn = file.source === "own" || file.source === "uploaded";
  return (
    <Dropdown
      menuLabel={`Actions for ${file.fileName}`}
      trigger={({ toggle, open, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Actions for ${file.fileName}`}
          className="text-slate-400 hover:text-navy rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <MoreHorizontal size={16} />
        </button>
      )}
      items={[
        { key: "rename", label: "Rename", icon: Pencil, onSelect: onRename, hidden: !isOwn },
        { key: "tags", label: "Edit tags", icon: Tag, onSelect: onTags, hidden: !isOwn },
        { key: "share", label: "Share", icon: Share2, onSelect: onShare, hidden: !isOwn },
        { key: "download", label: "Download", icon: Download, onSelect: download },
        { key: "delete", label: "Delete", icon: Trash2, onSelect: onDelete, danger: true, hidden: !isOwn }
      ]}
    />
  );
}

function ShareModal({
  file, onClose, onSent
}: { file: DocFile | null; onClose: () => void; onSent: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const showToast = useUiStore((s) => s.showToast);
  if (!file) return null;
  const submit = async () => {
    const emails = text.split(/[;,\s]+/).filter(Boolean);
    if (emails.length === 0 || emails.length > 5) {
      showToast("warn", "Enter 1-5 email addresses (semicolon-separated).");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/documents/${file.id}/share`, { emails });
      showToast("success", "Document shared.");
      onSent(); onClose();
    } catch (e) {
      showToast("danger", apiError(e));
    } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Share ${file.fileName}`}>
      <Input
        label="Recipient emails (semicolon-separated, max 5)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="alice@x.com; bob@y.com"
      />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={busy}>Share</Button>
      </div>
    </Modal>
  );
}

function RenameModal({
  file, onClose, onDone
}: { file: DocFile | null; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(file?.fileName ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(file?.fileName ?? ""); }, [file]);
  const showToast = useUiStore((s) => s.showToast);
  if (!file) return null;
  const save = async () => {
    setBusy(true);
    try {
      // BE expects { newName }
      await api.patch(`/documents/${file.id}`, { newName: name });
      showToast("success", "Renamed");
      onDone(); onClose();
    } catch { showToast("danger", "Rename failed"); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Rename file">
      <Input label="New name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy}>Save</Button>
      </div>
    </Modal>
  );
}

function TagsModal({
  file, onClose, onDone
}: { file: DocFile | null; onClose: () => void; onDone: () => void }) {
  const [tags, setTags] = useState<Set<string>>(new Set(file?.tags ?? []));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTags(new Set(file?.tags ?? [])); }, [file]);
  const showToast = useUiStore((s) => s.showToast);
  if (!file) return null;
  const toggle = (t: string) => {
    const next = new Set(tags);
    if (next.has(t)) next.delete(t);
    else if (next.size >= 2) showToast("warn", "Maximum 2 tags per file.");
    else next.add(t);
    setTags(next);
  };
  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/documents/${file.id}/tags`, { tags: Array.from(tags) });
      onDone(); onClose();
    } catch { showToast("danger", "Save failed"); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Tags for ${file.fileName}`}>
      <div className="flex gap-2 flex-wrap mb-4">
        {ALL_TAGS.map((t) => (
          <button
            key={t}
            onClick={() => toggle(t)}
            className={tags.has(t) ? "chip-gold" : "chip"}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={busy}>Save</Button>
      </div>
    </Modal>
  );
}
