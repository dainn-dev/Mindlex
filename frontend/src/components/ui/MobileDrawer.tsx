import { ReactNode, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "@/lib/useFocusTrap";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  side?: "left" | "right";
}

export function MobileDrawer({ open, onClose, title, children, side = "left" }: Props) {
  const drawerRef = useRef<HTMLElement>(null);
  const titleId = useId();
  useFocusTrap(drawerRef, open, onClose);

  if (!open) return null;

  const sideClass = side === "left" ? "left-0" : "right-0";
  const animClass = side === "left"
    ? "animate-[slideInLeft_220ms_ease-out]"
    : "animate-[slideInRight_220ms_ease-out]";

  const node = (
    <div className="fixed inset-0 z-40 md:hidden">
      <div
        className="absolute inset-0 bg-navy/50 animate-[fadeIn_200ms_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`absolute top-0 ${sideClass} h-full w-72 max-w-[85vw] bg-white shadow-lift overflow-y-auto outline-none ${animClass}`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <span id={titleId} className="text-xs font-semibold uppercase text-slate-400 tracking-wider">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-navy rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-3">
          {children}
        </div>
      </aside>
    </div>
  );

  return createPortal(node, document.body);
}
