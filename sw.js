// sw.js — Mayorcity E-Mart service worker
// Caches the app shell (HTML/CSS/JS/icons) so the site loads instantly on
// repeat visits and works even with a flaky connection. Listing data itself
// always comes fresh from Supabase — only the static site files are cached.

const CACHE_NAME = 'mayorcity-emart-v7';

const APP_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/config.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never cache API calls — Supabase (listings, auth, storage) and Paystack
  // must always hit the network so data/payments stay live and correct.
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('paystack.co') ||
    event.request.method !== 'GET'
  ) {
    return; // let the browser handle it normally
  }

  // App shell files: cache-first, falling back to network, so the site
  // still loads (mostly) even offline.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached); // if offline and not cached, this just fails gracefully
    })
  );
});

// ── Push notifications ──────────────────────────────────────────────────
// Fires even if the site tab isn't open, as long as the browser is running
// (and on Android, even if the browser itself is closed).
self.addEventListener('push', event => {
  let data = { title: 'Mayorcity E-Mart', body: 'You have a new notification.' };
  try { data = event.data.json(); } catch (_) { /* fall back to default above */ }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Mayorcity E-Mart', {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-192.png',
      data: { url: data.url || '/index.html' }
    })
  );
});

// Tapping the notification focuses an existing tab if one's open, or opens a new one.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/index.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
