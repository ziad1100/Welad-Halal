import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import { api } from '../services/api';

export interface AlertItem {
  id: string;
  kind: 'CASH_DISCREPANCY' | 'PENDING_RETURN_APPROVAL' | 'LOW_STOCK' | 'DAILY_SUMMARY';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  payload?: any;
  isRead: boolean;
  createdAt: string;
}

interface AlertsState {
  connected: boolean;
  items: AlertItem[];
  unread: number;
  last: AlertItem | null;
  init: (level: number, token: string) => void;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAll: () => Promise<void>;
  clearLast: () => void;
}

let socket: Socket | null = null;
let initialized = false;

/** Resolve the websocket origin from the API base (VITE_API_URL or same-origin). */
function wsOrigin(): string {
  const base = (import.meta as any).env?.VITE_API_URL || '';
  if (!base || base === '/api') return window.location.origin;
  return base.replace(/\/api\/?$/, '');
}

export const useAlerts = create<AlertsState>((set, get) => ({
  connected: false,
  items: [],
  unread: 0,
  last: null,
  init: (level, token) => {
    if (initialized) return;
    initialized = true;
    if (level < 50) return; // cashiers get no staff alerts
    try {
      socket = io(wsOrigin(), { auth: { token }, transports: ['websocket'], forceNew: false });
      socket.on('connect', () => set({ connected: true }));
      socket.on('disconnect', () => set({ connected: false }));
      socket.on('alert', (a: AlertItem) => {
        set((s) => ({ items: [a, ...s.items].slice(0, 200), unread: a.isRead ? s.unread : s.unread + 1, last: a }));
      });
    } catch { /* socket best-effort */ }
    void get().refresh();
  },
  refresh: async () => {
    try {
      const [list, cnt] = await Promise.all([
        api.get('/alerts', { params: { take: 40 } }),
        api.get('/alerts/unread/count'),
      ]);
      set({ items: list.data || [], unread: Number(cnt.data?.count ?? 0) });
    } catch { /* level-gated or offline */ }
  },
  markRead: async (id) => {
    await api.post(`/alerts/${id}/read`).catch(() => {});
    void get().refresh();
  },
  markAll: async () => {
    await api.post('/alerts/read-all').catch(() => {});
    void get().refresh();
  },
  clearLast: () => set({ last: null }),
}));
