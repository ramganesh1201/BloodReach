// ============================================================================
// CareLoop — Legacy Service Worker Bridge
// Consolidates all service worker responsibilities into the authoritative root worker
// File: public/sw.js
// ============================================================================

try {
  importScripts('/firebase-messaging-sw.js');
} catch (e) {
  console.warn('[sw.js] Failed to import unified service worker:', e);
}
