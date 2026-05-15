import { create } from "zustand";

export type ToastKind = "success" | "danger" | "warn" | "info";
export interface Toast { id: number; kind: ToastKind; message: string; }

interface UiState {
  toasts: Toast[];
  showToast: (kind: ToastKind, message: string, ttl?: number) => void;
  dismissToast: (id: number) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],
  showToast: (kind, message, ttl = 3500) => {
    const id = Date.now() + Math.random();
    set({ toasts: [...get().toasts, { id, kind, message }] });
    if (ttl > 0) {
      setTimeout(() => get().dismissToast(id), ttl);
    }
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
}));
