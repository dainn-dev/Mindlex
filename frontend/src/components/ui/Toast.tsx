import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { useUiStore, ToastKind } from "@/store/uiStore";

const colors: Record<ToastKind, string> = {
  success: "bg-emerald-600",
  danger: "bg-red-500",
  warn: "bg-amber-500",
  info: "bg-navy"
};

const Icons = {
  success: CheckCircle2,
  danger: AlertCircle,
  warn: AlertTriangle,
  info: Info
};

export function ToastHost() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const Icon = Icons[t.kind];
        return (
          <div
            key={t.id}
            className={`${colors[t.kind]} text-white rounded-lg shadow-lift px-4 py-2.5 text-sm flex items-start gap-3`}
          >
            <Icon size={18} className="shrink-0 mt-0.5" />
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
