/* ═══════════════════════════════════════════════════════════
   ROBS MOVIL — Service Worker
   Cache offline básico + estrategia network-first para HTML
   y cache-first para assets estáticos (iconos, fuentes, libs).
════════════════════════════════════════════════════════════ */

const CACHE_VERSION = "robsmovil-v1.0.1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Archivos base que se guardan al instalar (app shell)
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./favicon.ico",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// ─── INSTALL ──────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn("[SW] Error precache:", err))
  );
});

// ─── ACTIVATE ─────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("robsmovil-") && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo GET
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // No cachear llamadas a Firebase / APIs en tiempo real (siempre red)
  if (
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("identitytoolkit.googleapis.com") ||
    url.hostname.includes("googleapis.com") && url.pathname.includes("token")
  ) {
    event.respondWith(fetch(request).catch(() => new Response("", { status: 503 })));
    return;
  }

  // Documento HTML principal: network-first con fallback a cache (para offline)
  if (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Resto de assets (CSS, JS, fuentes, iconos, librerías externas): cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});

// ─── MENSAJES (permite forzar actualización desde la app) ──
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
