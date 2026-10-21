importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey:"AIzaSyA-BlgE6EV-ZcpUBwgnJfvPOnexRdagpTU",
  authDomain:"robsmove.firebaseapp.com",
  projectId:"robsmove",
  storageBucket:"robsmove.firebasestorage.app",
  messagingSenderId:"250957798465",
  appId:"1:250957798465:web:3d4c4a970c36ba2b30bac0"
});
firebase.messaging();

// Mensajes "data-only": aquí mostramos la notificación (evita duplicados)
self.addEventListener("push", e => {
  let d = {};
  try { const p = e.data.json(); d = p.data || p.notification || {}; } catch (_) {}
  const title = d.title || "ROBS MOVIL";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    icon: "icon-192.png",
    badge: "icon-72.png",
    tag: d.tag || "robs",
    data: { url: d.url || "./" }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
