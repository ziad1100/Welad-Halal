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
      localStorage.removeItem('kstore_token');
      localStorage.removeItem('kstore_user');
      if (!location.pathname.includes('/login')) location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export function apiError(e: any): string {
  const msg = e?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join('، ');
  if (typeof msg === 'string') return msg;
  return 'حدث خطأ أثناء حفظ الطلب';
}
