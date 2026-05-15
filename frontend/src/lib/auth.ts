const ACCESS_KEY = "mindlex.access";
const REFRESH_KEY = "mindlex.refresh";

const pickStore = (remember: boolean) => (remember ? localStorage : sessionStorage);

export const setTokens = (
  access: string,
  refresh: string,
  remember: boolean
) => {
  const store = pickStore(remember);
  store.setItem(ACCESS_KEY, access);
  store.setItem(REFRESH_KEY, refresh);
};

export const getAccessToken = () =>
  localStorage.getItem(ACCESS_KEY) ?? sessionStorage.getItem(ACCESS_KEY);

export const getRefreshToken = () =>
  localStorage.getItem(REFRESH_KEY) ?? sessionStorage.getItem(REFRESH_KEY);

export const clearTokens = () => {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
};

export const isAuthenticated = () => !!getAccessToken();
