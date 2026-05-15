import { Copy, ThumbsUp, ThumbsDown, Download, FolderInput, AlertOctagon } from "lucide-react";
import { useState } from "react";
import type { ChatMessage } from "@/types";
import { useUiStore } from "@/store/uiStore";
import { api } from "@/lib/api";

interface Props {
  msg: ChatMessage;
  threadId?: string;
  onFeedback?: (id: string, type: "like" | "dislike") => void;
}

export function ChatMessageView({ msg, onFeedback }: Props) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"like" | "dislike" | null>(msg.feedback ?? null);
  const showToast = useUiStore((s) => s.showToast);

  if (msg.role === "user") {
    return (
      <div className="ml-auto max-w-3xl mb-5">
        <div className="bg-navy text-white rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">
          {msg.content}
        </div>
      </div>
    );
  }

  const toxic = msg.blocked || msg.category === "toxic";
  const copy = async () => {
    await navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submitFb = async (type: "like" | "dislike") => {
    if (feedback) return;
    setFeedback(type);
    try {
      await api.post("/chat/feedback", { messageId: msg.id, type });
      onFeedback?.(msg.id, type);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 409) return; // already submitted
      showToast("danger", "Could not submit feedback");
      setFeedback(null);
    }
  };

  const download = async () => {
    try {
      const r = await api.post(`/chat/messages/${msg.id}/download`, null, {
        responseType: "blob"
      });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = `Mindlex_draft_${msg.id}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("success", "Draft downloaded successfully");
    } catch {
      showToast("danger", "Download failed");
    }
  };

  const saveToFolder = async () => {
    try {
      await api.post(`/chat/messages/${msg.id}/save-to-folder`);
      showToast("success", "Your draft has been saved to your Content Management folder.");
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 413) {
        showToast(
          "warn",
          "File size exceeds limit (25MB). Please use the download option instead."
        );
      } else {
        showToast("danger", "Could not save to folder");
      }
    }
  };

  return (
    <div className="max-w-3xl mb-5">
      <div
        className={`rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed border ${
          toxic ? "bg-red-50 border-red-300 text-red-900" : "bg-white border-slate-200"
        }`}
      >
        {toxic && (
          <div className="font-semibold text-red-700 mb-1 flex items-center gap-2">
            <AlertOctagon size={16} /> Message blocked
          </div>
        )}
        <div className="whitespace-pre-wrap">{msg.content}</div>

        {msg.sources && msg.sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-dashed border-slate-200 text-xs">
            {msg.sourcesTitle && (
              <strong className="text-navy block mb-1">{msg.sourcesTitle}</strong>
            )}
            {msg.sources.map((s, i) =>
              s.type === "external" && s.url ? (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline block py-0.5"
                >
                  ↗ {s.label.slice(0, 50)}
                </a>
              ) : (
                <span key={i} className="text-slate-500 block py-0.5">
                  • {s.label}
                </span>
              )
            )}
            {msg.disclaimer && (
              <div className="text-[11px] text-slate-400 italic mt-2">{msg.disclaimer}</div>
            )}
          </div>
        )}
      </div>

      {!toxic && (
        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400 px-1">
          <button onClick={copy} title="Copy" className="hover:text-navy">
            <Copy size={14} className="inline" /> {copied ? "Copied" : ""}
          </button>
          <button
            onClick={() => submitFb("like")}
            className={feedback === "like" ? "text-gold font-bold" : "hover:text-navy"}
            disabled={!!feedback}
            title="Like"
          >
            <ThumbsUp size={14} className="inline" />
          </button>
          <button
            onClick={() => submitFb("dislike")}
            className={feedback === "dislike" ? "text-gold font-bold" : "hover:text-navy"}
            disabled={!!feedback}
            title="Dislike"
          >
            <ThumbsDown size={14} className="inline" />
          </button>
          {msg.actions?.includes("download") && (
            <button onClick={download} className="hover:text-navy" title="Download draft">
              <Download size={14} className="inline" /> Download
            </button>
          )}
          {msg.actions?.includes("save_to_folder") && (
            <button onClick={saveToFolder} className="hover:text-navy" title="Save to Drive">
              <FolderInput size={14} className="inline" /> Save to Drive
            </button>
          )}
          <span className="ml-auto">
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {msg.jurisdiction && ` · ${msg.jurisdiction}`}
          </span>
        </div>
      )}
    </div>
  );
}
