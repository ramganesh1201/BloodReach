// ============================================================================
// CareLoop — Consolidated Unified Service Worker
// Stack: PWA Offline Shell + Web Push + Firebase Cloud Messaging v9+ (compat mode)
// File: public/firebase-messaging-sw.js
// Scope: / (Root Scope)
// ============================================================================
// ARCHITECTURAL MANDATES:
// 1. Single authoritative service worker controlling the root origin scope (/).
// 2. Dual-capability: Handles both PWA offline asset caching and Firebase background push.
// 3. Static fallback Firebase configuration prevents silent failures on bare worker imports.
// 4. Zero patient PII in notifications (clinical summaries only).
// 5. Deep-linking client navigation on notification click.
// ============================================================================

// 1. Service Worker Compatible Firebase Scripts
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// 2. Canonical Firebase Web App Configuration
// Public web client credentials with dynamic query parameter override support
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCf3jJRJuh-TCgQa0u22527oyGLSexa5wE",
  authDomain: "careloop-7f47d.firebaseapp.com",
  projectId: "careloop-7f47d",
  storageBucket: "careloop-7f47d.firebasestorage.app",
  messagingSenderId: "908211766288",
  appId: "1:908211766288:web:9183c985015dad4a0f7695",
};

let queryApiKey = null;
let queryAuthDomain = null;
let queryProjectId = null;
let queryStorageBucket = null;
let queryMessagingSenderId = null;
let queryAppId = null;

try {
  if (typeof self !== 'undefined' && self.location && self.location.href) {
    const searchParams = new URL(self.location.href).searchParams;
    queryApiKey = searchParams.get('apiKey');
    queryAuthDomain = searchParams.get('authDomain');
    queryProjectId = searchParams.get('projectId');
    queryStorageBucket = searchParams.get('storageBucket');
    queryMessagingSenderId = searchParams.get('messagingSenderId');
    queryAppId = searchParams.get('appId');
  }
} catch (e) {
  // Fallback to static defaults
}

const firebaseConfig = {
  apiKey: queryApiKey || DEFAULT_FIREBASE_CONFIG.apiKey,
  authDomain: queryAuthDomain || DEFAULT_FIREBASE_CONFIG.authDomain,
  projectId: queryProjectId || DEFAULT_FIREBASE_CONFIG.projectId,
  storageBucket: queryStorageBucket || DEFAULT_FIREBASE_CONFIG.storageBucket,
  messagingSenderId: queryMessagingSenderId || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
  appId: queryAppId || DEFAULT_FIREBASE_CONFIG.appId,
};

// 3. Safe Firebase Initialization
let messaging = null;
try {
  if (typeof firebase !== 'undefined' && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'REPLACE_ME') {
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(firebaseConfig);
    }
    messaging = firebase.messaging();
  }
} catch (err) {
  console.warn('[firebase-messaging-sw] Firebase initialization deferred:', err);
}

// 4. Background Push Notification Handler (Firebase SDK)
if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    // Zero Patient PII: Use generic clinical titles and non-identifying emergency summaries
    const title = payload.notification?.title || payload.data?.title || 'CareLoop Emergency Blood Alert';
    const body = payload.notification?.body || payload.data?.body || 'Urgent blood coordination alert. Open CareLoop for clinical details.';

    const targetUrl = payload.data?.click_action || payload.data?.url || '/donor';
    const reqId = payload.data?.requestId || 'emergency-alert';

    const notificationOptions = {
      body,
      icon: '/logo.png',
      badge: '/favicon.svg',
      tag: `careloop-req-${reqId}`,
      renotify: true,
      requireInteraction: true,
      data: {
        url: targetUrl,
        requestId: payload.data?.requestId,
        referenceCode: payload.data?.referenceCode,
        timestamp: Date.now(),
      },
      actions: [
        { action: 'open', title: 'Open CareLoop' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    };

    return self.registration.showNotification(title, notificationOptions);
  });
}

// 5. Fallback Standard 'push' Event Listener for Direct Web Push Payloads
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    if (data.notification || data.data) {
      const title = data.notification?.title || data.data?.title || 'CareLoop Emergency Blood Alert';
      const body = data.notification?.body || data.data?.body || 'Urgent blood coordination alert.';
      const targetUrl = data.data?.click_action || data.data?.url || '/donor';
      const reqId = data.data?.requestId || 'emergency-alert';

      event.waitUntil(
        self.registration.showNotification(title, {
          body,
          icon: '/logo.png',
          badge: '/favicon.svg',
          tag: `careloop-req-${reqId}`,
          renotify: true,
          requireInteraction: true,
          data: { url: targetUrl, requestId: reqId },
          actions: [
            { action: 'open', title: 'Open CareLoop' },
            { action: 'dismiss', title: 'Dismiss' },
          ],
        })
      );
    }
  } catch {
    // Non-JSON push payload
  }
});

// 6. Notification Click & App Navigation Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a CareLoop window/tab is open, focus and navigate it
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if ('navigate' in client && targetUrl !== '/') {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // If no open tab, launch new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// 7. PWA Offline Cache Management & Version Lifecycle
const CACHE_NAME = 'careloop-cache-v4';
const IMMUTABLE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/logo.png',
  '/logo.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(IMMUTABLE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 8. Fetch Event: Network-First for Navigation, Cache-First for Assets
self.addEventListener('fetch', (event) => {
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

  // Cache-first for immutable static assets (/assets/*, favicon, manifest, svgs)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        const contentType = cachedResponse.headers.get('content-type') || '';
        // Guard against corrupted HTML cached as JS
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

        if (
          url.pathname.startsWith('/assets/') ||
          url.pathname.endsWith('.svg') ||
          url.pathname.endsWith('.png') ||
          url.pathname.endsWith('.json')
        ) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }

        return networkResponse;
      });
    })
  );
});
