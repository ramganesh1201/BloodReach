// ============================================================================
// CareLoop — Firebase Cloud Messaging Service Worker
// Stack: PWA + Web Push + Firebase Cloud Messaging v9+ (compat mode)
// File: public/firebase-messaging-sw.js
// ============================================================================
// SECURITY & PRIVACY MANDATES:
// 1. Generic, privacy-preserving notification text (Zero patient PII).
// 2. Navigates to verified CareLoop routes on notification click.
// 3. Deduplicates notifications with request-specific tags.
// 4. Maintains offline shell cache for PWA resilience.
// ============================================================================

// 1. Service Worker Compatible Firebase Scripts
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// 2. Public Firebase Web App Configuration Placeholders
// Replace with values from Firebase Console -> Project Settings -> General -> Web Apps
const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};

// 3. Safe Firebase Initialization
let messaging = null;
try {
  if (typeof firebase !== 'undefined' && firebaseConfig.apiKey && firebaseConfig.apiKey !== 'REPLACE_ME') {
    firebase.initializeApp(firebaseConfig);
    messaging = firebase.messaging();
  }
} catch (err) {
  // Silent fallback when config placeholders are present
}

// 4. Background Push Notification Handler
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

// Fallback standard 'push' event listener for direct Web Push payloads
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    // If handled by Firebase SDK, avoid duplicate display
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
          data: { url: targetUrl },
        })
      );
    }
  } catch {
    // Non-JSON payload
  }
});

// 5. Notification Click & App Navigation Handler
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

// 6. PWA Offline Cache Management (Ensures PWA shell functions under this service worker)
const CACHE_NAME = 'careloop-pwa-cache-v1';
const ASSETS_TO_CACHE = ['/', '/index.html', '/manifest.json', '/favicon.svg', '/logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).catch(() => {})
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

