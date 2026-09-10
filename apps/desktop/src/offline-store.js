/**
 * Offline outbox (§5d) — durable queue of mutating POS operations for the
 * Electron checkout shell, backed by better-sqlite3.
 *
 * Safety rules:
 * - Every op carries a stable `idempotencyKey` (UUID v4, generated once at
 *   enqueue time). The key is sent as the `Idempotency-Key` header, and the
 *   backend replays the SAME order on retry — duplicates are impossible even
 *   if a flush is retried after a network timeout with an unknown outcome.
 * - Ops are FIFO per enqueue order; a failed op blocks later ones (ordering
 *   matters for stock) until it succeeds or is explicitly discarded.
 * - HTTP 4xx (except 409-in-flight and 429) marks the op `dead` with the
 *   server message — retrying would never succeed. 5xx / network errors keep
 *   it `pending` with exponential backoff (max 10 attempts, then dead).
 * - Only `order.create` (POST /api/orders, the money-moving op) is queued.
 *   hold/confirm operate on existing server orders and are naturally
 *   idempotent server-side, so they are NOT queued — they run online only.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const MAX_ATTEMPTS = 10;

function loadDb(userDataPath) {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    throw new Error(
      'better-sqlite3 is not installed for this Electron build. Run `npm install` in apps/desktop ' +
        'and rebuild native modules (`npx @electron/rebuild -w better-sqlite3`) before packaging. ' +
        `Original: ${e.message}`,
    );
  }
  fs.mkdirSync(userDataPath, { recursive: true });
  const db = new Database(path.join(userDataPath, 'welad-outbox.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY,
      idempotencyKey TEXT NOT NULL UNIQUE,
      opType TEXT NOT NULL,
      payload TEXT NOT NULL,
      authToken TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      lastError TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS outbox_status_idx ON outbox(status, createdAt);
  `);
  // Added after initial release: auth token per op (refreshed on each login).
  try { db.exec(`ALTER TABLE outbox ADD COLUMN authToken TEXT`); } catch { /* already exists */ }
  return db;
}

function nextBackoffMs(attempts) {
  return Math.min(30000, 1000 * 2 ** Math.max(0, attempts - 1));
}

class OfflineStore {
  constructor(userDataPath, dbOverride) {
    this.db = dbOverride || loadDb(userDataPath);
  }

  /** Enqueue an order-create payload. Returns the queued row (with idempotencyKey). */
  enqueueOrder(payload, authToken) {
    const now = Date.now();
    const row = {
      id: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      opType: 'order.create',
      payload: JSON.stringify(payload),
      authToken: authToken || null,
      status: 'pending',
      attempts: 0,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        'INSERT INTO outbox (id, idempotencyKey, opType, payload, authToken, status, attempts, lastError, createdAt, updatedAt) VALUES (@id, @idempotencyKey, @opType, @payload, @authToken, @status, @attempts, @lastError, @createdAt, @updatedAt)',
      )
      .run(row);
    return { ...row, payload };
  }

  /** Oldest pending op whose backoff has elapsed, or null. */
  nextPending(now = Date.now()) {
    return (
      this.db
        .prepare("SELECT * FROM outbox WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 1")
        .get() || null
    );
  }

  dueForRetry(op, now = Date.now()) {
    if (!op || op.attempts <= 0) return true;
    return now - op.updatedAt >= nextBackoffMs(op.attempts);
  }

  markDone(id) {
    this.db.prepare("DELETE FROM outbox WHERE id = ?").run(id);
  }

  markAttemptFailed(id, errMessage) {
    const op = this.db.prepare('SELECT attempts FROM outbox WHERE id = ?').get(id);
    const attempts = (op?.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      this.db
        .prepare("UPDATE outbox SET status = 'dead', attempts = ?, lastError = ?, updatedAt = ? WHERE id = ?")
        .run(attempts, String(errMessage).slice(0, 500), Date.now(), id);
    } else {
      this.db
        .prepare("UPDATE outbox SET attempts = ?, lastError = ?, updatedAt = ? WHERE id = ?")
        .run(attempts, String(errMessage).slice(0, 500), Date.now(), id);
    }
  }

  /** Non-retryable server rejection — kept for the cashier to inspect, never retried. */
  markDead(id, errMessage) {
    this.db
      .prepare("UPDATE outbox SET status = 'dead', lastError = ?, updatedAt = ? WHERE id = ?")
      .run(String(errMessage).slice(0, 500), Date.now(), id);
  }

  /** Refresh the stored token on all pending ops (called after each login). */
  updatePendingToken(authToken) {
    this.db.prepare("UPDATE outbox SET authToken = ?, updatedAt = ? WHERE status = 'pending'").run(authToken || null, Date.now());
  }

  pendingCount() {
    return this.db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE status = 'pending'").get().n;
  }

  deadCount() {
    return this.db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE status = 'dead'").get().n;
  }

  listDead() {
    return this.db.prepare("SELECT id, opType, attempts, lastError, createdAt FROM outbox WHERE status = 'dead' ORDER BY createdAt DESC LIMIT 50").all();
  }

  discard(id) {
    this.db.prepare('DELETE FROM outbox WHERE id = ?').run(id);
  }

  close() {
    this.db.close();
  }
}

module.exports = { OfflineStore, MAX_ATTEMPTS, nextBackoffMs };
