import { ReactNode, useEffect, useRef, useState, KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { cls } from "@/lib/utils";

export interface DropdownItem {
  key: string;
  label: ReactNode;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

interface Props {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.Ref<HTMLButtonElement> }) => ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
  width?: string;
  menuLabel?: string;
}

export function Dropdown({ trigger, items, align = "right", width = "w-44", menuLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const visibleItems = items.filter((i) => !i.hidden);

  const toggle = () => setOpen((v) => !v);
  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current && !menuRef.current.contains(target) &&
        triggerRef.current && !triggerRef.current.contains(target)
      ) {
        close(false);
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
  }, [open]);

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const focusables = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? []
    );
    if (focusables.length === 0) return;
    const currentIndex = focusables.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = focusables[(currentIndex + 1) % focusables.length];
      next.focus();
      setActiveIndex(focusables.indexOf(next));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = focusables[(currentIndex - 1 + focusables.length) % focusables.length];
      prev.focus();
      setActiveIndex(focusables.indexOf(prev));
    } else if (e.key === "Home") {
      e.preventDefault();
      focusables[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      focusables[focusables.length - 1].focus();
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  return (
    <div className="relative inline-block">
      {trigger({ open, toggle, ref: triggerRef })}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={onMenuKey}
          className={cls(
            "absolute top-full mt-1 bg-white border border-slate-200 rounded-md shadow-lift py-1 z-20",
            width,
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {visibleItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                role="menuitem"
                disabled={item.disabled}
                tabIndex={i === activeIndex ? 0 : -1}
                onClick={() => {
                  if (item.disabled) return;
                  item.onSelect();
                  close(true);
                }}
                className={cls(
                  "w-full text-left px-3 py-1.5 text-sm flex items-center gap-2",
                  "hover:bg-slate-50 focus:bg-slate-100 focus:outline-none",
                  item.danger && "text-red-600",
                  item.disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                {Icon && <Icon size={12} />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
