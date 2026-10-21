const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

async function enviar(uids, tokens, data) {
  tokens = [...new Set(tokens)];
  for (let i = 0; i < tokens.length; i += 500) {
    const lote = tokens.slice(i, i + 500);
    const res = await admin.messaging().sendEachForMulticast({
      tokens: lote,
      data,                                   // data-only: lo muestra el service worker
      webpush: { headers: { Urgency: "high", TTL: "60" } }
    });
    // Limpiar tokens muertos
    const muertos = [];
    res.responses.forEach((r, idx) => {
      const c = r.error && r.error.code;
      if (c === "messaging/registration-token-not-registered" ||
          c === "messaging/invalid-registration-token") muertos.push(lote[idx]);
    });
    if (muertos.length) {
      await Promise.all(uids.map(u =>
        db.collection("usuarios").doc(u).update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(...muertos)
        }).catch(() => {})
      ));
    }
  }
}

// 1) Viaje nuevo -> avisar a los drivers del mismo país
exports.notificarNuevoViaje = onDocumentCreated("viajes/{id}", async (event) => {
  const v = event.data && event.data.data();
  if (!v || v.estado !== "buscando") return;

  const snap = await db.collection("usuarios")
    .where("rol", "==", "driver")
    .where("paisCodigo", "==", v.paisCodigo || "DEFAULT").get();

  const uids = [], tokens = [];
  snap.forEach(d => {
    const u = d.data();
    if (u.estado === "inactivo") return;
    (u.fcmTokens || []).forEach(t => tokens.push(t));
    uids.push(d.id);
  });
  if (!tokens.length) return;

  await enviar(uids, tokens, {
    title: "🚗 Nuevo viaje disponible",
    body: `${v.origen || "Origen"} → ${v.destino || "Destino"} · ${v.ofertaActual || ""}`,
    tag: "viaje-" + event.params.id
  });
});

// 2) Un driver acepta el viaje -> avisar al cliente
exports.notificarViajeAceptado = onDocumentUpdated("viajes/{id}", async (event) => {
  const antes = event.data.before.data(), despues = event.data.after.data();
  if (!antes || !despues) return;
  if (antes.estado === "aceptado" || despues.estado !== "aceptado") return;

  const cli = await db.collection("usuarios").doc(despues.clienteId).get();
  const tokens = (cli.exists && cli.data().fcmTokens) || [];
  if (!tokens.length) return;

  await enviar([despues.clienteId], tokens, {
    title: "✅ Tu viaje fue aceptado",
    body: "Un conductor va en camino.",
    tag: "aceptado-" + event.params.id
  });
});
