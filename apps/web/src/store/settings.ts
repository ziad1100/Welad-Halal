import { create } from 'zustand';
import { api } from '../services/api';

export interface SettingsValues {
  cash_discrepancy_threshold: string;
  store_accepting_orders: string;
  store_phone: string;
  customer_display_enabled: string;
  return_approval_threshold: string;
}

interface SettingsState {
  values: Partial<SettingsValues> | null;
  /** Public store-close status — available to all levels (incl. POS). */
  acceptingOrders: boolean;
  /** §2 — whether the customer display mirror is enabled (public setting). */
  customerDisplayEnabled: boolean;
  loadPublic: () => Promise<void>;
  loadAll: () => Promise<void>;
  setValue: (key: keyof SettingsValues, value: string) => Promise<void>;
  setAccepting: (v: boolean) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  values: null,
  acceptingOrders: true,
  customerDisplayEnabled: true,
  loadPublic: async () => {
    try {
      const { data } = await api.get('/settings/public');
      set({
        acceptingOrders: data?.store_accepting_orders !== 'false',
        // Older backends may not expose the key yet → default to enabled.
        customerDisplayEnabled: data?.customer_display_enabled !== 'false',
      });
    } catch { /* ignore */ }
  },
  loadAll: async () => {
    try {
      const { data } = await api.get('/settings');
      set({
        values: data?.values || null,
        acceptingOrders: data?.values?.store_accepting_orders !== 'false',
        customerDisplayEnabled: (data?.values ?? data)?.customer_display_enabled !== 'false',
      });
    } catch { /* level-gated */ }
  },
  setValue: async (key, value) => {
    await api.patch('/settings', { key, value });
    await get().loadAll();
  },
  setAccepting: async (v) => {
    try {
      await api.post('/store/accepting', { accepting: v });
    } catch { /* older backend */ await api.patch('/settings', { key: 'store_accepting_orders', value: v ? 'true' : 'false' }); }
    set({ acceptingOrders: v });
  },
}));

/** §3 — distinct alert chime (longer than the scan beep). */
export function alertChime(ok = true) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const notes = ok ? [880, 1174.66] : [440, 329.63, 220];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f;
      o.type = 'sine';
      const t = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.start(t); o.stop(t + 0.2);
    });
    setTimeout(() => ctx.close(), notes.length * 200 + 100);
  } catch { /* ignore */ }
}
