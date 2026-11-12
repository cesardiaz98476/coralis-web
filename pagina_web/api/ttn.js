// Recibe los uplinks de TTN (integración Webhook) y los escribe en Firebase RTDB.
// Reemplaza al puente MQTT en PC; conserva la misma estructura de nodos.

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
    databaseURL: process.env.FIREBASE_DB_URL,
  });
}

const db = admin.database();

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  if (req.headers["x-coralis-key"] !== process.env.TTN_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    const data = req.body;
    const device = data?.end_device_ids?.device_id;
    const up = data?.uplink_message;
    const dec = up?.decoded_payload;

    if (!device || !dec) {
      console.log("Uplink sin payload decodificado, se ignora");
      return res.status(200).json({ ignorado: true });
    }

    const registro = {
      ph: dec.ph,
      temperatura: dec.temperature_c,
      turbidez: dec.turbidity_ntu,
      timestamp: up.received_at || new Date().toISOString(),
    };

    await Promise.all([
      db.ref(`lecturas/${device}/ultima`).set(registro),
      db.ref(`lecturas/${device}/historial`).push(registro),
    ]);

    console.log("Enviado a Firebase:", device, registro);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Error procesando uplink:", e);
    return res.status(500).json({ error: "Error interno" });
  }
};
