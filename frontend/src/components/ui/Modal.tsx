import { ReactNode, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "@/lib/useFocusTrap";

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  disableBackdropClose?: boolean;
}

const sizes = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" };

export function Modal({ open, onClose, title, children, size = "md", disableBackdropClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef, open, onClose);

  if (!open) return null;

  const node = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4"
      onClick={disableBackdropClose ? undefined : onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`bg-white rounded-2xl shadow-lift w-full ${sizes[size]} max-h-[90vh] overflow-y-auto outline-none animate-[modalIn_180ms_ease-out]`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <h4 id={titleId} className="font-semibold text-navy">{title}</h4>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-navy rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
