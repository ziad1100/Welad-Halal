/**
 * §2 — Electron desktop shell for Welad Halal POS.
 *
 * - Main window: loads the Vite web app (dev server or served build).
 * - Customer Display: a dedicated fullscreen frameless BrowserWindow opened on
 *   the SECOND physical monitor when one is connected; falls back to the
 *   primary display otherwise. The cart mirror syncs in-process via
 *   BroadcastChannel between the two renderers (same origin/session), so the
 *   display updates with zero polling and zero API traffic.
 *
 * The renderer never gets Node access: it talks to this file only through the
 * small contextBridge API in preload.js.
 */
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

/** Web app origin: dev server by default, WELAD_WEB_URL overrides for prod. */
const WEB_URL = process.env.WELAD_WEB_URL || 'http://localhost:5173';

let mainWin = null;

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1366,
    height: 768,
    backgroundColor: '#0b1622',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWin.loadURL(WEB_URL);
  mainWin.on('closed', () => { mainWin = null; });
}

/** Pick the first display that is NOT the primary one (§2 second monitor). */
function secondaryDisplay() {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().find((d) => d.id !== primary.id) || null;
}

/**
 * Open (or focus) the Customer Display window on the second monitor. Safe to
 * call repeatedly: an existing display window is focused instead of duplicated.
 */
function openCustomerDisplay() {
  const existing = BrowserWindow.getAllWindows().find((w) => w !== mainWin);
  if (existing) {
    existing.show();
    existing.focus();
    return { ok: true, reused: true };
  }

  const second = secondaryDisplay();
  const bounds = second ? second.bounds : screen.getPrimaryDisplay().bounds;
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fullscreen: !!second, // only true fullscreen when dedicated monitor exists
    frame: false,
    backgroundColor: '#04101f',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL(`${WEB_URL}#/display`);
  win.on('closed', () => { /* just gone; next call opens a fresh one */ });
  return { ok: true, secondMonitor: !!second };
}

app.whenReady().then(() => {
  createMainWindow();
  initOfflineOutbox();

  ipcMain.handle('open-customer-display', () => openCustomerDisplay());
  ipcMain.handle('offline-enqueue', (_e, payload, token) => offlineEnqueue(payload, token));
  ipcMain.handle('offline-flush', (_e, token) => offlineFlush(token));
  ipcMain.handle('offline-counts', () => offlineCounts());
  ipcMain.handle('offline-dead', () => offlineDead());
  ipcMain.handle('offline-discard', (_e, id) => offlineDiscard(id));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/**
 * Offline outbox wiring (§5d). All optional: if better-sqlite3 is unavailable
 * the shell still runs, but order queueing is disabled and reported.
 */
let outbox = null;
let syncWorker = null;

function offlineNotify(evt) {
  try { mainWin?.webContents.send('offline-event', evt); } catch { /* renderer gone */ }
}

function initOfflineOutbox() {
  try {
    const { OfflineStore } = require('./offline-store');
    const { createSyncWorker } = require('./sync');
    outbox = new OfflineStore(app.getPath('userData'));
    syncWorker = createSyncWorker({ store: outbox, notify: offlineNotify });
    syncWorker.start(30000);
    syncWorker.flushOnce().catch(() => {});
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[offline] outbox disabled: ${e.message}`);
    outbox = null;
    syncWorker = null;
  }
}

function offlineAvailable() {
  if (!outbox || !syncWorker) throw new Error('الطابور غير متاح في هذه النسخة');
}

async function offlineEnqueue(payload, token) {
  offlineAvailable();
  const row = outbox.enqueueOrder(payload, token);
  syncWorker.flushOnce().catch(() => {});
  return { id: row.id, pending: outbox.pendingCount() };
}

async function offlineFlush(token) {
  offlineAvailable();
  return syncWorker.flushOnce(token);
}

async function offlineCounts() {
  if (!outbox) return { available: false, pending: 0, dead: 0 };
  return { available: true, pending: outbox.pendingCount(), dead: outbox.deadCount() };
}

async function offlineDead() {
  offlineAvailable();
  return outbox.listDead();
}

async function offlineDiscard(id) {
  offlineAvailable();
  outbox.discard(String(id));
  return offlineCounts();
}
