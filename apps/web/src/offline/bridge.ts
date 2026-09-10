/** Renderer side of the Electron offline outbox (§5d).
 * All helpers no-op outside the desktop shell (pure browser / Vercel).
 * Only order CREATE payloads are queued; hold/confirm run online only
 * (they operate on existing server orders and are idempotent server-side). */

interface OfflineBridge {
  enqueueOrder: (payload: unknown, token: string | null) => Promise<{ id: string; pending: number }>;
  flushQueue: (token?: string | null) => Promise<{ flushed: number; pending: number }>;
  counts: () => Promise<{ available: boolean; pending: number; dead: number }>;
}

function bridge(): OfflineBridge | null {
  try {
    const w = window as unknown as { desktopBridge?: { offline?: unknown } };
    const b = w?.desktopBridge?.offline;
    return b && typeof (b as OfflineBridge).enqueueOrder === 'function' ? (b as OfflineBridge) : null;
  } catch {
    return null;
  }
}

export function isOfflineQueueAvailable(): boolean {
  return !!bridge();
}

export function currentToken(): string | null {
  try {
    return localStorage.getItem('kstore_token');
  } catch {
    return null;
  }
}

/** Queue an order payload for later sync. Throws when the bridge is unavailable. */
export async function enqueueOrder(payload: unknown): Promise<{ id: string; pending: number }> {
  const b = bridge();
  if (!b) throw new Error('الطابور غير متاح');
  return b.enqueueOrder(payload, currentToken());
}

/** Flush now (e.g. after login, on reconnect, on POS mount). Never throws. */
export async function flushQueue(): Promise<{ flushed: number; pending: number }> {
  const b = bridge();
  if (!b) return { flushed: 0, pending: 0 };
  try {
    return await b.flushQueue(currentToken());
  } catch {
    return { flushed: 0, pending: 0 };
  }
}

export async function offlineCounts(): Promise<{ available: boolean; pending: number; dead: number }> {
  const b = bridge();
  if (!b) return { available: false, pending: 0, dead: 0 };
  try {
    return await b.counts();
  } catch {
    return { available: false, pending: 0, dead: 0 };
  }
}
