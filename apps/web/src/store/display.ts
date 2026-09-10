import { create } from 'zustand';

/**
 * §2 — Customer Display mirror. The Cashier window publishes the live cart
 * snapshot here; any open Customer Display window (second screen/second
 * Electron BrowserWindow) renders it read-only. In-process via BroadcastChannel
 * + localStorage fallback so it works in browsers and Electron without polling.
 */
export interface DisplayLine {
  name: string;
  quantity: number;
  unitPrice: number;
}
export interface DisplaySnapshot {
  lines: DisplayLine[];
  units: number;
  total: number;
  customerName: string;
  orderType: string;
  updatedAt: number;
  cashier?: string;
}
export const DISPLAY_CHANNEL = 'kstore_customer_display';

function post(snapshot: DisplaySnapshot) {
  try {
    const payload = JSON.stringify(snapshot);
    localStorage.setItem(DISPLAY_CHANNEL, payload);
    try {
      const bc = new BroadcastChannel(DISPLAY_CHANNEL);
      bc.postMessage(payload);
      bc.close();
    } catch { /* BroadcastChannel unsupported — storage event fallback */ }
  } catch { /* storage blocked (private mode) */ }
}

function readStored(): DisplaySnapshot | null {
  try {
    const raw = localStorage.getItem(DISPLAY_CHANNEL);
    return raw ? (JSON.parse(raw) as DisplaySnapshot) : null;
  } catch { return null; }
}

interface DisplayState {
  snapshot: DisplaySnapshot | null;
  /** Cashier side: push a fresh cart snapshot to all mirror windows. */
  publish: (s: DisplaySnapshot) => void;
  /** Mirror side: subscribe; returns an unsubscribe fn. */
  subscribe: (fn: (s: DisplaySnapshot) => void) => () => void;
  loadStored: () => void;
}

export const useCustomerDisplay = create<DisplayState>((set) => ({
  snapshot: null,
  publish: (s) => {
    post(s);
    set({ snapshot: s });
  },
  subscribe: (fn) => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === DISPLAY_CHANNEL && e.newValue) {
        try { fn(JSON.parse(e.newValue)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', onStorage);
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(DISPLAY_CHANNEL);
      bc.onmessage = (e) => {
        try { fn(typeof e.data === 'string' ? JSON.parse(e.data) : e.data); } catch { /* ignore */ }
      };
    } catch { /* BroadcastChannel unsupported */ }
    const first = readStored();
    if (first) fn(first);
    return () => {
      window.removeEventListener('storage', onStorage);
      try { bc?.close(); } catch { /* ignore */ }
    };
  },
  loadStored: () => {
    const s = readStored();
    if (s) set({ snapshot: s });
  },
}));

/** True when the last mirror update is older than `ms` (show idle state). */
export function displayStale(s: DisplaySnapshot | null, ms = 8000): boolean {
  if (!s) return true;
  return Date.now() - s.updatedAt > ms;
}
