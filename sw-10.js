// ============================================================
// ROBS MOVIL — Service Worker v1.1
// ============================================================

const CACHE_NAME = 'robs-movil-v2';
const BASE = './';

// Recursos que se cachean en la instalación inicial
const ASSETS_TO_CACHE = [
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Nunito:wght@400;600;700&display=swap'
];

// ─── INSTALACIÓN ────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando v2...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => cache.add(url).catch(e => {
          console.warn('[SW] No se pudo cachear:', url, e);
        }))
      );
    }).then(() => {
      console.log('[SW] Instalado ✅');
      return self.skipWaiting();
    })
  );
});

// ─── ACTIVACIÓN (limpiar caches viejos) ─────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activando...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Eliminando cache viejo:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ──────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Solo se puede cachear GET; POST/PUT/etc (streams de Firestore, etc.) se dejan pasar
  if (event.request.method !== 'GET') {
    return;
  }

  // Ignorar peticiones externas que no deben cachearse
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    (url.hostname.includes('googleapis.com') && url.pathname.includes('/v1/')) ||
    url.hostname.includes('openstreetmap.org') ||
    url.hostname.includes('osrm.me') ||
    url.hostname.includes('nominatim') ||
    url.hostname.includes('identitytoolkit') ||
    url.protocol === 'chrome-extension:'
  ) {
    return;
  }

  // HTML principal: Network-First (siempre intenta versión más reciente)
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone).catch(() => {}));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request)
            .then(cached => cached || caches.match(BASE + 'index.html'));
        })
    );
    return;
  }

  // Resto de recursos: Cache-First con fallback a red
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone).catch(() => {}));
        }
        return response;
      }).catch(() => {
        console.warn('[SW] Recurso no disponible offline:', url.href);
      });
    })
  );
});

// ─── NOTIFICACIONES PUSH ────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'ROBS MOVIL';
  const options = {
    body: data.body || 'Tienes una nueva notificación',
    icon: data.icon || BASE + 'icon-192.png',
    badge: BASE + 'icon-192.png',
    tag: data.tag || 'robs-notif',
    data: { url: data.url || BASE },
    actions: data.actions || [],
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction || false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── CLICK EN NOTIFICACIÓN ───────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || BASE;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes('robsmove') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ─── SYNC EN BACKGROUND ─────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pendientes') {
    console.log('[SW] Sync en background activado');
  }
});
