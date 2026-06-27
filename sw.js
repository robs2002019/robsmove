// ============================================================
// ROBS MOVIL — Service Worker v1.0
// ============================================================

const CACHE_NAME = 'robs-movil-v1';

// Recursos que se cachean en la instalación inicial
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Nunito:wght@400;600;700&display=swap'
];

// ─── INSTALACIÓN ────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cachear assets críticos; ignorar errores de CDNs externas
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => {
      console.log('[SW] Instalado y assets cacheados');
      return self.skipWaiting(); // Activar inmediatamente sin esperar recarga
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
    ).then(() => self.clients.claim()) // Tomar control de todas las pestañas abiertas
  );
});

// ─── FETCH: Estrategia Network-First para HTML, Cache-First para assets ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignorar peticiones a Firebase, APIs externas y Chrome extensions
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('googleapis.com') && url.pathname.includes('/v1/') ||
    url.hostname.includes('openstreetmap.org') ||
    url.hostname.includes('osrm.me') ||
    url.hostname.includes('nominatim') ||
    url.protocol === 'chrome-extension:'
  ) {
    return; // Dejar pasar sin interceptar
  }

  // Para el HTML principal: Network-First (siempre intenta la versión más reciente)
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Actualizar caché con la versión más reciente
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request)) // Offline: usar caché
    );
    return;
  }

  // Para todos los demás recursos: Cache-First con fallback a red
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
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
    icon: data.icon || './icon-192.png',
    badge: './icon-192.png',
    tag: data.tag || 'robs-notif',
    data: { url: data.url || './' },
    actions: data.actions || [],
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction || false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── CLICK EN NOTIFICACIÓN ───────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Si ya hay una ventana abierta, enfocarla
      for (const client of clientList) {
        if (client.url.includes('robs_movil') && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no, abrir una nueva
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

// ─── SINCRONIZACIÓN EN BACKGROUND (para cuando vuelve la conexión) ────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-pendientes') {
    console.log('[SW] Sync en background activado');
    // Aquí puedes enviar datos pendientes a Firebase cuando regrese la red
  }
});
