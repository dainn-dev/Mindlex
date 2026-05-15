import { create } from "zustand";
import type { User } from "@/types";
import { api } from "@/lib/api";
import { setTokens, clearTokens, isAuthenticated } from "@/lib/auth";

interface AuthState {
  user: User | null;
  initialized: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<User>;
  socialLogin: (provider: "google" | "microsoft", code: string) => Promise<User>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setTone: (tone: "plain" | "technical") => void;
}

export interface RegisterData {
  fullName: string;
  email: string;
  password: string;
  dateOfBirth: string;
  acceptTerms: boolean;
  acceptPrivacy: boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  initialized: false,

  login: async (email, password, remember) => {
    const { data } = await api.post("/auth/login", { email, password, remember });
    setTokens(data.accessToken, data.refreshToken, remember);
    set({ user: data.user, initialized: true });
    return data.user;
  },

  socialLogin: async (provider, code) => {
    const { data } = await api.post(`/auth/oauth/${provider}`, { code });
    setTokens(data.accessToken, data.refreshToken, true);
    set({ user: data.user, initialized: true });
    return data.user;
  },

  register: async (data) => {
    await api.post("/auth/register", data);
  },

  logout: async () => {
    try { await api.post("/auth/logout"); } catch {/* ignore */}
    clearTokens();
    set({ user: null });
    window.location.href = "/";
  },

  refreshUser: async () => {
    if (!isAuthenticated()) { set({ initialized: true }); return; }
    try {
      const { data } = await api.get("/profile/me");
      set({ user: data, initialized: true });
    } catch {
      set({ user: null, initialized: true });
    }
  },

  setTone: (tone) => {
    const u = get().user;
    if (u) set({ user: { ...u, tone } });
  }
}));
