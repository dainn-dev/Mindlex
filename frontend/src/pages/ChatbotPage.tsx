// Screen 7 \u2605 \u2014 Legal Chatbot
import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { Link2, ShieldCheck, Download, MessagesSquare, Sparkles } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatMessageView } from "@/components/chat/ChatMessage";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { Button } from "@/components/ui/Button";
import type { ChatMessage, ChatQuotaPayload, ChatQuotaResponse, ComplianceIssue, Tone } from "@/types";

export function ChatbotPage() {
  const user = useAuthStore((s) => s.user);
  const setTone = useAuthStore((s) => s.setTone);
  const showToast = useUiStore((s) => s.showToast);
  const location = useLocation();

  const [threadId, setThreadId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quota, setQuota] = useState<ChatQuotaPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [compliance, setCompliance] = useState<ComplianceIssue[] | null>(null);
  const [risks, setRisks] = useState<ComplianceIssue[] | null>(null);
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false);

  const streamRef = useRef<HTMLDivElement>(null);
  const tone: Tone = user?.tone ?? "plain";
  const canToggleTone = user?.roles.some((r) => r === "Plus" || r === "Premium" || r === "Admin") ?? false;
  const canUseCompliance = user?.roles.some((r) => r === "Premium" || r === "Admin") ?? false;

  useEffect(() => {
    api.get<ChatQuotaResponse>("/chat/quota")
      .then((r) => setQuota(r.data?.quota ?? null))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!threadId) { setMessages([]); return; }
    api.get(`/chat/threads/${threadId}`)
      .then((r) => setMessages(r.data.messages ?? []))
      .catch(() => undefined);
  }, [threadId]);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, compliance, risks]);

  useEffect(() => {
    const prefill = (location.state as { prefill?: string })?.prefill;
    if (prefill) onSend(prefill, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const onToneChange = async (t: Tone) => {
    setTone(t);
    try { await api.put("/chat/tone", { tone: t }); } catch {/* ignore */}
  };

  const newChat = () => {
    setThreadId(undefined);
    setMessages([]);
    setUploadId(null);
    setCompliance(null);
    setRisks(null);
  };

  const onSend = async (text: string, opts: { file?: File; mode?: "drafting" }) => {
    if (!text.trim() && !opts.file) return;
    setBusy(true);

    const userMsg: ChatMessage = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: text || `[file] ${opts.file?.name ?? "file"}`,
      createdAt: new Date().toISOString()
    };
    setMessages((m) => [...m, userMsg]);

    try {
      let currentUpload = uploadId;
      if (opts.file) {
        const fd = new FormData();
        fd.append("file", opts.file);
        const upRes = await api.post(
          `/chat/threads/${threadId ?? "new"}/uploads`,
          fd,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        currentUpload = upRes.data.uploadId;
        setUploadId(currentUpload);
        if (upRes.data.threadId) setThreadId(upRes.data.threadId);
      }

      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const { data } = await api.post("/chat/message", {
        message: text,
        threadId,
        history,
        mode: opts.mode,
        uploadId: currentUpload
      });

      if (data.threadId && !threadId) setThreadId(data.threadId);
      if (data.quota) setQuota(data.quota);

      const reply: ChatMessage = {
        id: data.messageId,
        role: "assistant",
        content: data.reply,
        createdAt: new Date().toISOString(),
        tone: data.tone,
        category: data.category,
        blocked: data.blocked,
        escalated: data.escalated,
        jurisdiction: data.jurisdiction,
        sources: data.sources,
        sourcesTitle: data.sourcesTitle,
        disclaimer: data.disclaimer,
        actions: data.actions
      };
      setMessages((m) => [...m, reply]);

      if (data.anonymization?.piiMatchesRemoved > 0) {
        showToast("success", data.anonymization.toastMessage ??
          "All detected personal data has been successfully removed from your document.");
      }

      if (currentUpload && canUseCompliance) {
        const tid = data.threadId ?? threadId ?? "new";
        const comp = await api.post(`/chat/threads/${tid}/uploads/${currentUpload}/compliance-check`);
        setCompliance(comp.data.issues ?? []);
        const risk = await api.post(`/chat/threads/${tid}/uploads/${currentUpload}/risk-check`);
        setRisks(risk.data.issues ?? []);
      }
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number; data?: { code?: string } } })?.response?.status;
      if (status === 429) {
        showToast("warn", "Daily quota reached. Upgrade to keep asking.");
      } else {
        showToast("danger", apiError(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const downloadReport = async () => {
    if (!threadId || !uploadId) return;
    try {
      showToast("info", "Report is being downloaded...");
      const r = await api.post(
        `/chat/threads/${threadId}/uploads/${uploadId}/report`,
        null,
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(r.data);
      const a = document.createElement("a");
      a.href = url; a.download = "Compliance_Report.docx"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast("danger", "Could not generate report");
    }
  };

  return (
    <div className="grid md:grid-cols-[240px_1fr_280px] grid-cols-1 h-[calc(100vh-64px)]">
      <ChatSidebar
        activeId={threadId}
        onSelect={setThreadId}
        onNew={newChat}
        mobileOpen={sidebarMobileOpen}
        onMobileClose={() => setSidebarMobileOpen(false)}
      />

      <div className="flex flex-col min-w-0">
        <div className="px-4 md:px-6 py-3.5 border-b border-slate-200 bg-white flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarMobileOpen(true)}
              aria-label="Open conversations"
              className="md:hidden text-slate-500 hover:text-navy p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <MessagesSquare size={18} />
            </button>
            <h3 className="text-navy text-base font-semibold truncate">
              {threadId ? "Conversation" : "New conversation"}
            </h3>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="chip-success">
              <ShieldCheck size={12} /> Sources verified
            </span>
            <span className="chip">{tone === "plain" ? "Plain tone" : "Technical tone"}</span>
            {quota && (
              <span className={
                !quota.unlimited
                && typeof quota.remaining === "number"
                && typeof quota.limit === "number"
                && quota.remaining / Math.max(quota.limit, 1) < 0.2
                  ? "chip-warn"
                  : "chip-gold"
              }>
                {quota.unlimited
                  ? "Unlimited"
                  : `${quota.remaining ?? 0}/${quota.limit ?? 0}`}
              </span>
            )}
          </div>
        </div>

        <div ref={streamRef} className="flex-1 overflow-y-auto px-4 md:px-6 py-5">
          {messages.length === 0 ? (
            <div className="text-center text-slate-400 mt-10">
              <Sparkles size={40} className="mx-auto text-gold mb-3" />
              <h4 className="text-navy font-semibold text-xl">Ask your first legal question</h4>
              <p className="text-sm mt-1">
                Try: <em>"What are my GDPR obligations as a SaaS founder?"</em>
              </p>
            </div>
          ) : (
            messages.map((m) => (
              <ChatMessageView key={m.id} msg={m} threadId={threadId} />
            ))
          )}
          {compliance && <ComplianceResults issues={compliance} title="Compliance check" />}
          {risks && (
            <ComplianceResults issues={risks} title="Risk identification" variant="danger" />
          )}
          {compliance && risks && (
            <div className="mt-3 max-w-3xl">
              <Button variant="gold" size="sm" onClick={downloadReport}>
                <Download size={14} /> Download Compliance Report
              </Button>
            </div>
          )}
          {busy && (
            <div className="text-slate-400 text-sm flex items-center gap-2">
              <span className="inline-block w-2 h-2 bg-gold rounded-full animate-pulse" />
              Mindlex is thinking...
            </div>
          )}
        </div>

        <ChatComposer
          onSend={onSend}
          tone={tone}
          onToneChange={onToneChange}
          canToggleTone={canToggleTone}
          disabled={busy || quota?.allowed === false}
          quotaBanner={
            quota?.allowed === false && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded p-3 mb-2 flex justify-between items-center">
                <span>Daily limit reached. Upgrade to keep asking.</span>
                <Link to="/account/subscription" className="btn-gold btn-sm">
                  Upgrade
                </Link>
              </div>
            )
          }
        />
      </div>

      <ReferenceWidget />
    </div>
  );
}

function ReferenceWidget() {
  const year = new Date().getFullYear();
  return (
    <aside className="bg-white border-l border-slate-200 p-4 hidden lg:block">
      <h5 className="text-navy text-xs font-semibold uppercase tracking-wider mb-2.5">
        Reference
      </h5>
      <p className="text-xs text-slate-500 mb-4">
        Mindlex provides AI-assisted legal information. Always verify with a qualified lawyer.
      </p>
      <h5 className="text-navy text-xs font-semibold uppercase tracking-wider mb-2.5">
        Quick links
      </h5>
      {[
        ["Terms of Service", "/terms"],
        ["Privacy Policy", "/privacy"],
        ["Usage Policy", "/usage"],
        ["LinkedIn", "https://linkedin.com/company/mindlex"]
      ].map(([label, href]) => (
        <Link
          key={label}
          to={href as string}
          target={href!.toString().startsWith("http") ? "_blank" : undefined}
          className="block text-sm text-navy hover:text-gold py-1"
        >
          <Link2 size={12} className="inline mr-1.5" /> {label}
        </Link>
      ))}
      <div className="mt-5 pt-4 border-t border-slate-200 text-[11px] text-slate-400">
        \u00a9 {year} MINDLEX LIMITED
      </div>
    </aside>
  );
}

function ComplianceResults({
  issues, title, variant = "gold"
}: { issues: ComplianceIssue[]; title: string; variant?: "gold" | "danger" }) {
  if (issues.length === 0) return null;
  const cls =
    variant === "danger"
      ? "bg-red-50 border-l-4 border-red-500"
      : "bg-amber-50 border-l-4 border-gold";
  return (
    <div className={`max-w-3xl rounded-md p-4 mt-3 ${cls}`}>
      <h5 className="text-navy font-semibold mb-2">
        {title} ({issues.length})
      </h5>
      {issues.map((it, i) => (
        <div key={i} className="mt-2.5 pt-2.5 border-t border-amber-200 first:border-0 first:pt-0">
          <strong className="text-sm">
            {it.severity ? `${it.severity.toUpperCase()} \u2014 ` : ""}
            {it.title}
          </strong>
          <p className="text-xs italic text-slate-500 mt-0.5">{it.sourceSnippet}</p>
          <p className="text-sm text-slate-700 mt-1">{it.explanation}</p>
          <p className="text-sm mt-1">
            <strong>Suggested {variant === "danger" ? "rewrite" : "clause"}:</strong> {it.suggestion}
          </p>
        </div>
      ))}
    </div>
  );
}
