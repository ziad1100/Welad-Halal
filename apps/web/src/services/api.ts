import axios from 'axios';

const baseURL = (import.meta as any).env?.VITE_API_URL || '/api';

export const api = axios.create({ baseURL });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('kstore_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      // Never hijack the login request itself: a wrong password is a 401
      // and must stay on the login form as an auth error, not a redirect.
      const url = String(err?.config?.url || '');
      const isLoginRequest = url.includes('/auth/login');
      if (!isLoginRequest) {
        localStorage.removeItem('kstore_token');
        localStorage.removeItem('kstore_user');
        // App uses HashRouter, so location.pathname is virtually always '/'.
        // Check the hash as well before forcing a navigation.
        const onLogin = location.pathname.includes('/login') || location.hash.includes('login');
        if (!onLogin) location.href = '/login';
      }
    }
    return Promise.reject(err);
  },
);

export const CONNECTION_ERROR = 'تعذر الاتصال بالخادم، حاول مرة أخرى';
export const GENERIC_ERROR = 'حدث خطأ — حاول مرة أخرى';

export function apiError(e: any, fallback: string = GENERIC_ERROR): string {
  const msg = e?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join('، ');
  if (typeof msg === 'string' && msg.trim()) return msg;
  // No usable backend message (offline / CORS / timeout / empty 500):
  // use a neutral message — never an order-specific one here.
  if (!e?.response) return CONNECTION_ERROR;
  return fallback;
}
