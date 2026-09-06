// SqueveTrack service worker
// Purpose (in priority order):
//   1. Let the app show notifications via registration.showNotification(),
//      which is required on many mobile browsers once a service worker is
//      registered — the raw `new Notification()` constructor can throw
//      there. This file existing + activating is what makes that work.
//   2. Handle taps on those notifications and route back into the app at
//      the right screen (PTP hub, a specific borrower, the log page).
//   3. Minimal offline fallback — WITHOUT aggressively caching the app
//      shell, since this app is updated frequently and a stale cache
//      silently serving old code is worse than no offline support at all.

const CACHE_NAME = 'squevetrack-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting(); // activate immediately, don't wait for old tabs to close
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim()); // take control of any already-open tabs
});

// Network-first, cache-fallback — only used when the device is offline.
// This deliberately does NOT pre-cache or cache-bust aggressively: every
// online load always gets the freshest index.html, so a new deployment is
// never masked by an old cached copy. The cache only exists as a safety
// net for the moment connectivity drops.
//
// { cache: 'no-store' } is the critical part here: without it, this fetch()
// is still subject to the BROWSER's own HTTP cache, which can serve a
// stale response without hitting the network at all — regardless of what
// this file's intent is. This matters a lot on hosts (GitHub Pages) that
// don't support the project's _headers file, so index.html has no
// Cache-Control header telling the browser not to do that. no-store makes
// this fetch bypass the HTTP cache unconditionally, on every host.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return; // never cache POST/PUT/etc.

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Tapping a notification: focus an already-open tab if one exists (and
// hand it the deep link via postMessage so it can navigate without a full
// reload), otherwise open a new one with ?notif=... which index.html reads
// on load via _consumeNotifDeepLink().
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          if (url) client.postMessage({ type: 'sq-notif-click', url });
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url ? ('./' + url) : './');
      }
    })
  );
});
