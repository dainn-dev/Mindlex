// LC1 + LC6 + DC1 + DD1 \u2014 Composer: input, tone toggle, mode dropdown, file upload
import { KeyboardEvent, useRef, useState } from "react";
import { Paperclip, Send, X, ChevronDown } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import type { Tone } from "@/types";

interface Props {
  onSend: (text: string, opts: { file?: File; mode?: "drafting" }) => void;
  tone: Tone;
  onToneChange?: (t: Tone) => void;
  canToggleTone: boolean;
  disabled?: boolean;
  quotaBanner?: React.ReactNode;
}

export function ChatComposer({
  onSend, tone, onToneChange, canToggleTone, disabled, quotaBanner
}: Props) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"drafting" | undefined>();
  const fileInput = useRef<HTMLInputElement>(null);

  const send = () => {
    if (!text.trim() && !file) return;
    onSend(text, { file: file ?? undefined, mode });
    setText("");
    setFile(null);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="border-t border-slate-200 bg-white p-3.5">
      {quotaBanner}
      <div className="flex items-center gap-2 mb-2.5 text-xs text-slate-500">
        {file && (
          <span className="chip-warn">
            <Paperclip size={11} /> {file.name}
            <button onClick={() => setFile(null)} className="ml-1" aria-label="Remove file">
              <X size={12} />
            </button>
          </span>
        )}
        <ModeDropdown active={mode} onChange={setMode} />
        {canToggleTone && (
          <div className="ml-auto flex bg-slate-100 rounded-full p-1">
            <ToneButton active={tone === "plain"} onClick={() => onToneChange?.("plain")}>
              Plain
            </ToneButton>
            <ToneButton active={tone === "technical"} onClick={() => onToneChange?.("technical")}>
              Technical
            </ToneButton>
          </div>
        )}
      </div>
      <div className="flex items-end gap-2.5 bg-slate-100 rounded-lg p-2 focus-within:bg-white focus-within:ring-2 focus-within:ring-gold">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="text-slate-500 hover:text-navy p-1"
          aria-label="Attach file"
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".docx,.doc"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
            e.target.value = "";
          }}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          rows={1}
          placeholder="Ask a legal question or upload a document for compliance check\u2026"
          className="flex-1 bg-transparent resize-none outline-none text-sm py-2 max-h-32"
          disabled={disabled}
        />
        <button
          type="button"
          onClick={send}
          disabled={disabled || (!text.trim() && !file)}
          className="w-9 h-9 rounded-full bg-navy text-white flex items-center justify-center disabled:bg-slate-300"
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function ToneButton({ active, ...rest }: { active: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`px-2.5 py-0.5 text-[11px] rounded-full font-medium ${
        active ? "bg-white text-navy shadow-sm" : "text-slate-500"
      }`}
    />
  );
}

function ModeDropdown({
  active, onChange
}: { active?: "drafting"; onChange: (m?: "drafting") => void }) {
  return (
    <Dropdown
      align="left"
      width="w-40"
      menuLabel="Chat mode"
      trigger={({ toggle, open, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-navy rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gold px-1"
        >
          Mode: {active ?? "Q&A"} <ChevronDown size={12} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
      )}
      items={[
        { key: "qa", label: "Q&A (default)", onSelect: () => onChange(undefined) },
        { key: "drafting", label: "Document Drafting", onSelect: () => onChange("drafting") }
      ]}
    />
  );
}
