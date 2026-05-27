// ════════════════════════════════════════════════════════════
// sw.js — Service Worker
// Versión: modular (incluye js/config, auth, sync, ui, expedientes)
// ════════════════════════════════════════════════════════════

const CACHE_NAME = 'tactica-cache-v4';

// Assets estáticos que SÍ se cachean
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './logo.svg',
    './icon-180.png',
    './icon-192.png',
    './icon-512.png',
    './db.js',
    './js/config.js',
    './js/auth.js',
    './js/sync.js',
    './js/ui.js',
    './js/expedientes.js',
];

// Dominios que NUNCA se cachean
// (OAuth, APIs autenticadas, respuestas de red privadas)
const NEVER_CACHE = [
    'accounts.google.com',
    'oauth2.googleapis.com',
    'sheets.googleapis.com',
    'drive.googleapis.com',
    'googleapis.com',
    'www.googleapis.com',
];

// Extensiones que sí pueden cachearse dinámicamente
const CACHEABLE_EXTENSIONS = [
    '.html', '.css', '.js', '.json',
    '.png', '.svg', '.jpg', '.jpeg',
    '.woff', '.woff2', '.ico',
];

function esCacheable(url) {
    try {
        const u = new URL(url);

        // Nunca cachear dominios de OAuth/API
        if (NEVER_CACHE.some(d => u.hostname.includes(d))) {
            return false;
        }

        // Solo cachear extensiones conocidas o rutas locales
        const path = u.pathname;
        return CACHEABLE_EXTENSIONS.some(ext => path.endsWith(ext)) ||
               u.origin === self.location.origin;

    } catch {
        return false;
    }
}

// ── INSTALACIÓN ───────────────────────────────────────────
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// ── ACTIVACIÓN ────────────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// ── FETCH ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {

    // Solo interceptar GET
    if (event.request.method !== 'GET') return;

    // No interceptar requests no cacheables (OAuth, APIs)
    if (!esCacheable(event.request.url)) return;

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {

                // Cache hit → devolver inmediatamente
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Cache miss → red
                return fetch(event.request)
                    .then(networkResponse => {

                        if (!networkResponse || networkResponse.status !== 200) {
                            return networkResponse;
                        }

                        // Guardar en cache solo si es cacheable
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(event.request, responseClone));

                        return networkResponse;
                    })
                    .catch(() => {
                        // Fallback offline: servir index.html para navegación
                        if (event.request.mode === 'navigate') {
                            return caches.match('./index.html');
                        }
                    });
            })
    );
});
