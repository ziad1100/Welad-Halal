/**
 * Offline outbox logic tests (§5d). Run: npm test --workspace apps/desktop
 * (node --test, no dependencies).
 *
 * Uses an in-memory fake implementing the exact statement contract of
 * offline-store.js. Raw SQL syntax itself is validated separately against
 * real SQLite (see Phase 5 report); these tests pin the JS state machine:
 * enqueue → FIFO → backoff → dead → discard, plus token refresh.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { OfflineStore, MAX_ATTEMPTS, nextBackoffMs } = require('../src/offline-store');

function fakeDb() {
  const rows = new Map(); // id -> row
  const byKey = new Map(); // idempotencyKey -> id
  return {
    pragma() {},
    exec() {},
    close() {},
    prepare(sql) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('INSERT INTO outbox')) {
        return { run: (r) => {
          if (rows.has(r.id) || byKey.has(r.idempotencyKey)) throw new Error('UNIQUE constraint failed');
          rows.set(r.id, { ...r }); byKey.set(r.idempotencyKey, r.id); return {};
        } };
      }
      if (s.includes("status = 'pending' ORDER BY createdAt")) {
        return { get: () => [...rows.values()].filter((r) => r.status === 'pending').sort((a, b) => a.createdAt - b.createdAt)[0] || null };
      }
      if (s.startsWith('SELECT attempts FROM outbox')) {
        return { get: (id) => (rows.has(id) ? { attempts: rows.get(id).attempts } : undefined) };
      }
      if (s.startsWith('DELETE FROM outbox')) {
        return { run: (id) => { const r = rows.get(id); if (r) { byKey.delete(r.idempotencyKey); rows.delete(id); } return {}; } };
      }
      if (s.startsWith('UPDATE outbox SET authToken')) {
        return { run: (tok, now) => { for (const r of rows.values()) if (r.status === 'pending') { r.authToken = tok; r.updatedAt = now; } return {}; } };
      }
      if (s.startsWith("UPDATE outbox SET status = 'dead'")) {
        return { run: (att, err, now, id) => { const r = rows.get(id); if (r) Object.assign(r, { status: 'dead', attempts: att, lastError: err, updatedAt: now }); return {}; } };
      }
      if (s.startsWith('UPDATE outbox SET attempts')) {
        return { run: (att, err, now, id) => { const r = rows.get(id); if (r) Object.assign(r, { attempts: att, lastError: err, updatedAt: now }); return {}; } };
      }
      if (s.startsWith('SELECT COUNT(*)')) {
        const status = s.includes("'pending'") ? 'pending' : 'dead';
        return { get: () => ({ n: [...rows.values()].filter((r) => r.status === status).length }) };
      }
      if (s.startsWith('SELECT id, opType')) {
        return { all: () => [...rows.values()].filter((r) => r.status === 'dead').map((r) => ({ id: r.id, opType: r.opType, attempts: r.attempts, lastError: r.lastError, createdAt: r.createdAt })) };
      }
      throw new Error(`unexpected SQL in fake: ${s.slice(0, 80)}`);
    },
  };
}

test('enqueue → pending FIFO with stable idempotency keys', () => {
  const store = new OfflineStore('unused', fakeDb());
  const a = store.enqueueOrder({ items: [1] }, 'tok');
  const b = store.enqueueOrder({ items: [2] }, 'tok');
  assert.notEqual(a.idempotencyKey, b.idempotencyKey);
  assert.equal(store.pendingCount(), 2);
  assert.equal(store.nextPending().id, a.id);
});

test('backoff: fresh op due, failed op waits, dead after MAX_ATTEMPTS', () => {
  const store = new OfflineStore('unused', fakeDb());
  const a = store.enqueueOrder({ items: [1] }, null);
  const op = store.nextPending();
  assert.equal(store.dueForRetry(op), true);
  store.markAttemptFailed(a.id, 'net down');
  assert.equal(store.dueForRetry(store.nextPending()), false);
  assert.equal(nextBackoffMs(1), 1000);
  assert.equal(nextBackoffMs(9) <= 30000, true);
  for (let i = 0; i < MAX_ATTEMPTS; i++) store.markAttemptFailed(a.id, 'x');
  assert.equal(store.pendingCount(), 0);
  assert.equal(store.deadCount(), 1);
  assert.equal(store.listDead()[0].id, a.id);
  store.discard(a.id);
  assert.equal(store.deadCount(), 0);
});

test('markDone removes; updatePendingToken refreshes pending ops', () => {
  const store = new OfflineStore('unused', fakeDb());
  const a = store.enqueueOrder({ items: [1] }, 'old');
  store.updatePendingToken('new');
  assert.equal(store.nextPending().authToken, 'new');
  store.markDone(a.id);
  assert.equal(store.pendingCount(), 0);
});
