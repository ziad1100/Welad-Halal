/**
 * Pre-test readiness probe: wait (up to ~60s) for PostgreSQL to accept
 * TCP connections before Jest starts. Guards against transient
 * Docker Desktop port flaps that used to fail entire suites on first run.
 * No dependencies — parses DATABASE_URL only. Fails loudly if DB stays down.
 */
const net = require('net');

const raw = process.env.DATABASE_URL || 'postgresql://kstore:kstore@localhost:5432/kstore?schema=public';
let host = 'localhost';
let port = 5432;
try {
  const u = new URL(raw);
  host = u.hostname || host;
  port = Number(u.port) || port;
} catch { /* keep defaults */ }

function tryOnce() {
  return new Promise((res) => {
    const s = net.connect({ host, port, timeout: 3000 }, () => { s.end(); res(true); });
    s.on('error', () => res(false));
    s.on('timeout', () => { s.destroy(); res(false); });
  });
}

(async () => {
  for (let i = 0; i < 30; i++) {
    if (await tryOnce()) process.exit(0);
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.error(`[pretest] database not reachable at ${host}:${port} after 60s`);
  process.exit(1);
})();
