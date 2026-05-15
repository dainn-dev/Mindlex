import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from "axios";
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "./auth";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "/api";

export const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
  headers: { "Content-Type": "application/json" }
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ---- Refresh-token flow ----
// On the first 401 from a non-auth call we try POST /auth/refresh once.
// If refresh succeeds we replay the original request; if it fails we clear
// tokens and redirect to /login. Concurrent 401s are queued onto the same
// refresh promise so we never fire two refreshes in parallel.

let refreshPromise: Promise<string | null> | null = null;

const isAuthEndpoint = (url: string | undefined) =>
  !!url && (url.includes("/auth/login")
    || url.includes("/auth/register")
    || url.includes("/auth/refresh")
    || url.includes("/auth/oauth/"));

const refreshAccessToken = async (): Promise<string | null> => {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const remember = !!localStorage.getItem("mindlex.access");
    const r = await axios.post(`${baseURL}/auth/refresh`, { refreshToken: refresh });
    const access: string | undefined = r.data?.accessToken;
    const newRefresh: string | undefined = r.data?.refreshToken;
    if (!access) return null;
    setTokens(access, newRefresh ?? refresh, remember);
    return access;
  } catch {
    return null;
  }
};

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (status !== 401 || !original || original._retry || isAuthEndpoint(original.url)) {
      return Promise.reject(error);
    }

    original._retry = true;

    if (!refreshPromise) {
      refreshPromise = refreshAccessToken().finally(() => { refreshPromise = null; });
    }
    const newToken = await refreshPromise;

    if (!newToken) {
      clearTokens();
      if (window.location.pathname !== "/login") window.location.href = "/login";
      return Promise.reject(error);
    }

    original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${newToken}` };
    return api.request(original);
  }
);

export const apiError = (e: unknown): string => {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { message?: string; error?: string } | undefined;
    return data?.message ?? data?.error ?? e.message;
  }
  return e instanceof Error ? e.message : "Unexpected error";
};
