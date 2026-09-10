/**
 * §2 — Minimal, explicit bridge between the web renderer and Electron.
 * The Customer Display window is opened via main-process IPC; everything else
 * (cart mirroring) flows over BroadcastChannel between renderers directly.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopBridge', {
  /** Opens the Customer Display BrowserWindow on the second monitor. */
  openCustomerDisplay: () => ipcRenderer.invoke('open-customer-display'),
  /** Offline outbox (§5d). All methods reject when the outbox is unavailable
   * (e.g. pure browser, or native module not rebuilt for this Electron). */
  offline: {
    /** Queue an order-create payload; resolves { id, pending }. */
    enqueueOrder: (payload, token) => ipcRenderer.invoke('offline-enqueue', payload, token),
    /** Flush now (optional fresh token); resolves { flushed, pending }. */
    flushQueue: (token) => ipcRenderer.invoke('offline-flush', token),
    /** { available, pending, dead }. Never rejects. */
    counts: async () => {
      try { return await ipcRenderer.invoke('offline-counts'); }
      catch { return { available: false, pending: 0, dead: 0 }; }
    },
    dead: () => ipcRenderer.invoke('offline-dead'),
    discard: (id) => ipcRenderer.invoke('offline-discard', id),
    /** Subscribe to { type: 'synced'|'dead'|'flush'|'auth', ... } events. Returns unsubscribe. */
    onEvent: (cb) => {
      const listener = (_e, evt) => cb(evt);
      ipcRenderer.on('offline-event', listener);
      return () => ipcRenderer.removeListener('offline-event', listener);
    },
  },
});
