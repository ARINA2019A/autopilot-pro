// ══════════════════════════════════════════════════════════════
// AutoPilot Pro — Service Worker
// Stratégie: Cache-First pour assets statiques
//            Network-First pour les appels Supabase (API)
// ══════════════════════════════════════════════════════════════

const APP_VERSION    = 'autopilot-v1.0';
const STATIC_CACHE   = APP_VERSION + '-static';
const DYNAMIC_CACHE  = APP_VERSION + '-dynamic';

// Assets à mettre en cache au démarrage
const STATIC_ASSETS = [
  './garage-autopilot-pro.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// Domaines à traiter en Network-First (toujours chercher données fraîches)
const NETWORK_FIRST_DOMAINS = [
  'supabase.co',
  'googleapis.com',
  'gstatic.com',
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', function(event) {
  console.log('[SW] Installing AutoPilot Pro SW...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache) {
      return cache.addAll(STATIC_ASSETS).catch(function(err) {
        // Non-fatal — app still works without cache
        console.warn('[SW] Some assets not cached:', err);
      });
    }).then(function() {
      console.log('[SW] Installation complete');
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(key) {
            return key !== STATIC_CACHE && key !== DYNAMIC_CACHE;
          })
          .map(function(key) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // ── Supabase & external APIs → Network First (always fresh data)
  var isNetworkFirst = NETWORK_FIRST_DOMAINS.some(function(domain) {
    return url.hostname.includes(domain);
  });

  if (isNetworkFirst) {
    event.respondWith(
      fetch(event.request)
        .then(function(response) {
          // Cache successful GET responses for offline fallback
          if (event.request.method === 'GET' && response.status === 200) {
            var clone = response.clone();
            caches.open(DYNAMIC_CACHE).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(function() {
          // Offline — try cache
          return caches.match(event.request);
        })
    );
    return;
  }

  // ── Static assets → Cache First
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;

      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        var clone = response.clone();
        caches.open(DYNAMIC_CACHE).then(function(cache) {
          cache.put(event.request, clone);
        });
        return response;
      }).catch(function() {
        // Offline fallback for HTML
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./garage-autopilot-pro.html');
        }
      });
    })
  );
});

// ── BACKGROUND SYNC (optionnel) ───────────────────────────────
self.addEventListener('sync', function(event) {
  if (event.tag === 'sync-offline-data') {
    console.log('[SW] Background sync triggered');
    // Could retry failed Supabase requests stored in IndexedDB
  }
});

// ── PUSH NOTIFICATIONS (optionnel) ───────────────────────────
self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'AutoPilot Pro', {
      body:  data.body  || '',
      icon:  './icon-192.png',
      badge: './icon-192.png',
      data:  data,
    })
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('./garage-autopilot-pro.html')
  );
});

console.log('[SW] AutoPilot Pro Service Worker loaded ✓');
