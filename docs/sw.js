const CACHE_NAME = 'greenhouse-v4';
const ASSETS = ['/', '/index.html', '/app.js', '/manifest.json'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
    // Network-first for API calls, cache-first for assets
    if (e.request.url.includes('script.google.com')) {
        e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    } else {
        e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
    }
});
