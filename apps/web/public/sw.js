/* §7 — minimal service worker: enables Web Push notifications for the
   manager PWA. No caching logic (the app shell is served fresh; push
   notifications only need an active worker to receive messages). */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* text payload */ }
  const title = data.title || 'Welad Halal — تنبيه';
  const options = {
    body: data.body || '',
    icon: '/favicon.svg',
    badge: '/icons.svg',
    data: data.data || {},
    dir: 'rtl',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/#/m';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) { client.focus(); client.navigate(url); return; }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
