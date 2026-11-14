import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Self-healing chunk loading and version update handler
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[CareLoop] Asset chunk preload error detected. Reloading with fresh assets...');
  event.preventDefault();
  window.location.reload();
});

window.addEventListener('error', (event) => {
  const msg = event?.message || '';
  if (
    msg.includes('Failed to load module script') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed')
  ) {
    console.warn('[CareLoop] Obsolete chunk detected. Clearing cache and updating to latest release...');
    if (typeof caches !== 'undefined') {
      caches.keys().then((keys) => {
        return Promise.all(keys.map((k) => caches.delete(k)));
      }).then(() => {
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  }
});

// Register PWA Service Worker
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
