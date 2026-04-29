/**
 * Service Worker for Tracker Keeper
 * Caches all app assets for offline use.
 */

const CACHE_NAME = 'tracker-keeper-v2';
const ASSETS = [
  './',
  './index.html',
  './css/main.css',
  './js/db.js',
  './js/scheduler.js',
  './js/ui.js',
  './js/modals.js',
  './js/dashboard.js',
  './js/history.js',
  './js/app.js',
  './manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Cache-first for local assets
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});

