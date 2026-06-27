const CACHE_NAME = 'photo-metadata-editor-v1';
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon.svg",
  "/icon-512.jpg",
  "/assets/index-CmQFXsEc.css",
  "/assets/index-Cw_ONEbL.js"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache the bootstrap static shell assets
      return Promise.allSettled(
        ASSETS.map(asset => cache.add(asset).catch(err => console.warn('Failed to cache during install:', asset, err)))
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // We only intercept GET requests
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Handle same-origin assets (the app's built pages, JS, CSS, icons, etc.)
  if (url.origin === self.location.origin) {
    const isShellFile = url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/manifest.json';
    
    if (isShellFile) {
      // 1. Network-First Strategy for mutable shell files
      event.respondWith(
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            return caches.match(event.request);
          })
      );
    } else {
      // 2. Cache-First Strategy for hashed static assets and other files
      event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse.status === 200 || networkResponse.status === 0) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          }).catch((err) => {
            console.warn('Fetch failed offline for same-origin asset:', url.pathname, err);
          });
        })
      );
    }
  } else {
    // 3. For third-party assets (like Leaflet CDN styles or OpenStreetMap tile layers),
    // cache them cache-first so that map layers previously loaded will still work offline.
    const isTileRequest = url.hostname.includes('tile.openstreetmap.org');
    const isLeafletAsset = url.pathname.includes('leaflet') || url.hostname.includes('unpkg.com');
    
    if (isTileRequest || isLeafletAsset) {
      event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request).then((networkResponse) => {
            if (networkResponse.status === 200 || networkResponse.status === 0) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          }).catch(() => {
            // Offline failure for third party tile/asset - fail silently
          });
        })
      );
    }
  }
});
