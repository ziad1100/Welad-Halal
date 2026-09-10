/**
 * Outbox sync worker (§5d) — flushes queued order.create ops to the hosted
 * backend. Runs in the Electron main process on a timer + after every enqueue
 * + at startup. Single-flight: only one flush runs at a time.
 *
 * Per-op outcome mapping:
 * - 2xx → done (order created; server dedupes by Idempotency-Key header).
 * - 409 with 'قيد التنفيذ' → keep pending (another attempt in flight).
 * - 429 → keep pending, back off longer (requeue with attempt penalty).
 * - other 4xx → dead (server rejected the content; retrying is futile —
 *   cashier inspects via listDead and discards or fixes at the POS).
 * - network error / 5xx → pending with exponential backoff (MAX_ATTEMPTS).
 */

const API_BASE = () => `${process.env.WELAD_API_URL || 'http://localhost:3001/api'}`.replace(/\/+$/, '');

function authHeaders(getToken) {
  const h = { 'Content-Type': 'application/json' };
  try {
    const t = getToken && getToken();
    if (t) h.Authorization = `Bearer ${t}`;
  } catch { /* offline queue must never crash on token read */ }
  return h;
}

function createSyncWorker({ store, notify }) {
  let running = false;
  let timer = null;

  const tokenOf = (op) => {
    try { return op.authToken || null; } catch { return null; }
  };

  async function flushOnce(freshToken) {
    if (running) return { flushed: 0, pending: store.pendingCount() };
    // Login supplies a fresh token: refresh all pending ops before flushing.
    if (typeof freshToken === 'string' && freshToken) {
      try { store.updatePendingToken(freshToken); } catch { /* store unavailable */ }
    }
    running = true;
    let flushed = 0;
    try {
      for (;;) {
        const op = store.nextPending();
        if (!op || !store.dueForRetry(op)) break;
        if (op.opType !== 'order.create') {
          store.markDead(op.id, `unknown op type: ${op.opType}`);
          continue;
        }
        let payload;
        try {
          payload = JSON.parse(op.payload);
        } catch {
          store.markDead(op.id, 'corrupt payload');
          continue;
        }
        try {
          const res = await fetch(`${API_BASE()}/orders`, {
            method: 'POST',
            headers: { ...authHeaders(() => tokenOf(op)), 'Idempotency-Key': op.idempotencyKey },
            body: JSON.stringify(payload),
          });
          if (res.status === 401) {
            // Token rotated/expired — do NOT burn attempts or kill the op.
            // Renderer refreshes tokens via updatePendingToken on each login.
            notify && notify({ type: 'auth', id: op.id });
            break;
          }
          if (res.ok) {
            store.markDone(op.id);
            flushed += 1;
            notify && notify({ type: 'synced', id: op.id });
            continue;
          }
          let message = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            const m = body?.message;
            message = Array.isArray(m) ? m.join('، ') : String(m || message);
          } catch { /* keep status text */ }
          if (res.status === 429) {
            store.markAttemptFailed(op.id, message);
          } else if (res.status === 409 && message.includes('قيد التنفيذ')) {
            // Another attempt for the same key is in flight — leave pending.
            store.markAttemptFailed(op.id, message);
          } else if (res.status >= 400 && res.status < 500) {
            store.markDead(op.id, message);
            notify && notify({ type: 'dead', id: op.id, error: message });
          } else {
            store.markAttemptFailed(op.id, message);
          }
        } catch (e) {
          // Network down / DNS / refused — stay pending, back off.
          store.markAttemptFailed(op.id, e?.message || 'network error');
          break; // connectivity is gone; stop this pass early.
        }
      }
    } finally {
      running = false;
    }
    const pending = store.pendingCount();
    notify && notify({ type: 'flush', flushed, pending });
    return { flushed, pending };
  }

  function start(intervalMs = 30000) {
    stop();
    timer = setInterval(() => {
      flushOnce().catch(() => {});
    }, intervalMs);
    if (timer.unref) timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { flushOnce, start, stop };
}

module.exports = { createSyncWorker, API_BASE };
