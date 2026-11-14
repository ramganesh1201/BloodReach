// Service Worker for CareLoop PWA
// Integrates with Firebase Cloud Messaging background handler

try {
  importScripts('/firebase-messaging-sw.js');
} catch (e) {
  // Fallback if running offline or firebase script unavailable
}

const CACHE_NAME = 'careloop-cache-v3';
const IMMUTABLE_ASSETS = [
  '/manifest.json',
  '/favicon.svg',
  '/logo.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(IMMUTABLE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Network-first for navigation requests and index.html to prevent stale chunk hash mismatches
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first for immutable static assets (/assets/*, favicon, manifest)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Guard against corrupted HTML cached as JS
        const contentType = cachedResponse.headers.get('content-type') || '';
        if (url.pathname.endsWith('.js') && contentType.includes('text/html')) {
          caches.open(CACHE_NAME).then((cache) => cache.delete(event.request));
        } else {
          return cachedResponse;
        }
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const contentType = networkResponse.headers.get('content-type') || '';

        // STRICT GUARD: Never cache text/html responses for .js or .css asset requests (Vercel 404 rewrite fallback)
        if (url.pathname.endsWith('.js') && !contentType.includes('javascript')) {
          return networkResponse;
        }
        if (url.pathname.endsWith('.css') && !contentType.includes('css')) {
          return networkResponse;
        }

        if (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.json')) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }

        return networkResponse;
      });
    })
  );
});
