// ============================================================
// api/alertas.js — Función de Vercel que manda los correos de alertas.
//
// Cómo funciona (dos formas de despertarla, ver abajo):
//   - cron-job.org la llama cada pocos minutos (no hay que tocar TTN), o
//   - TTN la llama con un webhook cada vez que llega una lectura.
//   Dirección: https://prueba-drab-theta.vercel.app/api/alertas
//   Esta función calcula el estado del coral (mismas reglas que la página),
//   lo compara con el último guardado en Firebase (estado/<node_id>)
//   y si cambió, manda un correo a los suscritos (suscripciones/<node_id>).
//
// No necesita ningún computador prendido: Vercel la corre sola cada vez
// que la llaman.
//
// Variables de entorno (en Vercel -> Settings -> Environment Variables).
// SON SECRETAS: nunca van en GitHub ni en el código.
//   FIREBASE_SERVICE_ACCOUNT  todo el contenido de serviceAccountKey.json
//   CLAVE_ALERTAS             contraseña de aplicación del Gmail
//   CLAVE_WEBHOOK             una clave que ustedes inventan, para que nadie
//                             más pueda llamar esta función
// ============================================================

const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const CORREO_ALERTAS = "coralis.servicio.informativo@gmail.com";
const URL_DATABASE = "https://coralis-2ddd8-default-rtdb.firebaseio.com";

// Conectar a Firebase una sola vez (con la llave de administrador)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    databaseURL: URL_DATABASE,
  });
}
const db = admin.database();


// =====================================================================
// ★★★ ANÁLISIS DE DATOS ★★★  (las mismas reglas que principal.js)
//   pH:          Ideal 7.89–8.08 | Medio 6.5–7.89 (y 8.08–8.5) | Crítico < 6.5 o > 8.5
//   Temperatura: Ideal 25–27 °C  | Medio 18–25 y 27–29 °C       | Crítico < 18 o > 29
//   Turbidez:    Ideal 0–3 NTU   | Medio 3–5.5 NTU              | Crítico > 5.5
// =====================================================================
const RANGOS = {
  temp: { nombres: ["temperatura", "temperature_c"], idealMin: 25, idealMax: 27, criticoBajo: 18, criticoAlto: 29, nombre: "Temperatura", unidad: "°C" },
  ph:   { nombres: ["ph"], idealMin: 7.89, idealMax: 8.08, criticoBajo: 6.5, criticoAlto: 8.5, nombre: "pH", unidad: "" },
  turb: { nombres: ["turbidez", "turbidity_ntu"], idealMin: 0, idealMax: 3, criticoBajo: -1, criticoAlto: 5.5, nombre: "Turbidez", unidad: "NTU" },
};

const NOMBRES_ESTADO = {
  sano: "🟢 Coral saludable",
  riesgo: "🟡 Coral en riesgo",
  blanqueado: "⚪ Coral blanqueado",
};

// Busca el valor con cualquiera de sus nombres posibles
function leerValor(data, nombres) {
  for (const n of nombres) {
    if (data[n] !== undefined && data[n] !== null) return Number(data[n]);
  }
  return null;
}

// 'ideal' | 'medio' | 'critico'
function nivelDe(r, valor) {
  if (valor >= r.idealMin && valor <= r.idealMax) return "ideal";
  if (valor < r.criticoBajo || valor > r.criticoAlto) return "critico";
  return "medio";
}

// La peor variable decide: alguna crítica -> blanqueado, alguna en medio -> riesgo, si no -> sano
function calcularEstado(data) {
  const niveles = [];
  const problemas = [];
  for (const r of Object.values(RANGOS)) {
    const valor = leerValor(data, r.nombres);
    if (valor === null || isNaN(valor)) continue;
    const nivel = nivelDe(r, valor);
    niveles.push(nivel);
    if (nivel !== "ideal") {
      problemas.push(`${r.nombre}: ${valor} ${r.unidad} -> ${nivel === "critico" ? "CRÍTICO" : "medio"} (ideal entre ${r.idealMin} y ${r.idealMax})`);
    }
  }
  if (!niveles.length) return { estado: null, problemas };
  if (niveles.includes("critico")) return { estado: "blanqueado", problemas };
  if (niveles.includes("medio")) return { estado: "riesgo", problemas };
  return { estado: "sano", problemas };
}

// ---------- ★ PLUS: CAMBIOS BRUSCOS ----------
// Si entre una lectura y la siguiente un sensor cambia MÁS que esto,
// se manda una alerta aunque el estado del coral no haya cambiado.
// (Valores de ejemplo: ajústenlos con el grupo.)
const CAMBIO_MAXIMO = {
  temp: 1.5,   // °C
  ph: 0.3,
  turb: 2,     // NTU
};

// Saca { temp, ph, turb } de la lectura (null si falta alguno)
function valoresDe(data) {
  const v = {};
  for (const campo of Object.keys(RANGOS)) v[campo] = leerValor(data, RANGOS[campo].nombres);
  return v;
}

// Lista de textos de los sensores que cambiaron demasiado desde la lectura anterior
function cambiosBruscos(antes, ahora) {
  const cambios = [];
  for (const [campo, maximo] of Object.entries(CAMBIO_MAXIMO)) {
    const a = antes?.[campo], b = ahora[campo];
    if (a == null || b == null || isNaN(a) || isNaN(b)) continue;
    if (Math.abs(b - a) > maximo) {
      const r = RANGOS[campo];
      const dif = Math.round((b - a) * 100) / 100;
      cambios.push(`${r.nombre}: pasó de ${a} a ${b} ${r.unidad} (cambio de ${dif > 0 ? "+" : ""}${dif} en una lectura)`);
    }
  }
  return cambios;
}
// ===================== fin del ANÁLISIS DE DATOS =====================


// Manda el mismo correo a todos los suscritos (en copia oculta)
async function enviarCorreo(destinos, asunto, texto) {
  const transporte = nodemailer.createTransport({
    service: "gmail",
    auth: { user: CORREO_ALERTAS, pass: process.env.CLAVE_ALERTAS },
  });
  await transporte.sendMail({
    from: `Coralis <${CORREO_ALERTAS}>`,
    to: CORREO_ALERTAS,
    bcc: destinos,
    subject: asunto,
    text: texto,
  });
}


// Revisa UNA lectura. Manda correo si:
//   1) el estado del coral cambió, o
//   2) algún sensor tuvo un cambio brusco (el plus).
// Devuelve un texto corto que sale en los Logs de Vercel.
async function revisarLectura(lectura) {
  const data = lectura.uplink_message?.decoded_payload ?? lectura;
  const nodeId = String(data.node_id || "").toUpperCase();
  if (!nodeId) return "Sin node_id";

  const { estado, problemas } = calcularEstado(data);
  if (!estado) return `${nodeId}: sin datos de sensores`;
  const valores = valoresDe(data);

  // Comparar con lo último guardado y guardar lo nuevo
  const refEstado = db.ref(`estado/${nodeId}`);
  const anterior = (await refEstado.get()).val() || {};
  await refEstado.set({ estado, valores, desde_timestamp: data.timestamp ?? null });

  // Primera vez: solo se guarda
  if (!anterior.estado) return `${nodeId}: ${estado} (primera lectura)`;

  const cambioEstado = anterior.estado !== estado;
  const bruscos = cambiosBruscos(anterior.valores, valores);
  if (!cambioEstado && !bruscos.length) return `${nodeId}: ${estado} (sin cambio)`;

  const suscritos = (await db.ref(`suscripciones/${nodeId}`).get()).val() || {};
  const correos = Object.values(suscritos).map(s => s.correo).filter(Boolean);
  if (!correos.length) return `${nodeId}: hubo cambio, pero nadie está suscrito`;

  const hora = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
  let asunto, texto;
  if (cambioEstado) {
    asunto = `Coralis | ${nodeId}: ${NOMBRES_ESTADO[estado]}`;
    texto =
      `Hola,\n\n` +
      `El coral de ${nodeId} cambió de estado:\n` +
      `  Antes: ${NOMBRES_ESTADO[anterior.estado] ?? anterior.estado}\n` +
      `  Ahora: ${NOMBRES_ESTADO[estado]}\n`;
  } else {
    asunto = `Coralis | ${nodeId}: ⚠️ Cambio brusco en los sensores`;
    texto =
      `Hola,\n\n` +
      `Hubo un cambio brusco en ${nodeId}.\n` +
      `  Estado del coral: ${NOMBRES_ESTADO[estado]}\n`;
  }
  texto +=
    `  Hora del aviso: ${hora}\n\n` +
    `Última lectura:\n` +
    `  Temperatura: ${valores.temp} °C\n` +
    `  pH: ${valores.ph}\n` +
    `  Turbidez: ${valores.turb} NTU\n\n`;
  if (bruscos.length) texto += "⚠️ Cambios bruscos:\n  " + bruscos.join("\n  ") + "\n\n";
  if (problemas.length) texto += "Lo que no está ideal:\n  " + problemas.join("\n  ") + "\n\n";
  texto +=
    "Puedes ver los detalles en la página de Coralis.\n" +
    "Recibes este correo porque te suscribiste a este dispositivo; para dejar de recibirlos, " +
    "entra a la página y dale a \"Dejar de recibir alertas\".\n";

  await enviarCorreo(correos, asunto, texto);
  return `${nodeId}: correo enviado a ${correos.length} suscrito(s)`;
}

// Recorre carpetas y subcarpetas (ej: lecturas/coralis-device/historial/-P4M9...)
// y guarda en "lista" todo lo que sea una lectura (tiene node_id).
function juntarLecturas(nodo, lista) {
  if (!nodo || typeof nodo !== "object") return;
  const d = nodo.uplink_message?.decoded_payload ?? nodo;
  if (d.node_id) lista.push(nodo);                                       // es una lectura
  else Object.values(nodo).forEach((hijo) => juntarLecturas(hijo, lista)); // es una carpeta: entramos
}

// Busca en Firebase la última lectura de cada Raspberry
async function ultimasLecturas() {
  const ultimas = {};
  for (const carpeta of ["mediciones", "lecturas"]) {
    const lista = [];
    juntarLecturas((await db.ref(carpeta).get()).val(), lista);
    for (const lectura of lista) {   // vienen en orden: la última queda de último
      const d = lectura.uplink_message?.decoded_payload ?? lectura;
      ultimas[String(d.node_id).toUpperCase()] = lectura;
    }
  }
  return Object.values(ultimas);
}


// ---------- Lo que corre cada vez que llaman a /api/alertas ----------
// Dos formas de llamarla:
//   POST (TTN webhook): trae la lectura en el body -> se revisa esa.
//   GET  (cron-job.org cada pocos minutos): no trae nada -> se busca en Firebase
//        la última lectura de cada Raspberry y se revisa.
// En las dos hay que mandar la clave: encabezado "x-clave" o ?clave=... en la URL.
module.exports = async (req, res) => {
  const clave = req.headers["x-clave"] || req.query?.clave;
  if (clave !== process.env.CLAVE_WEBHOOK) return res.status(401).send("Clave incorrecta");

  try {
    let resultados;
    if (req.method === "POST") {
      resultados = [await revisarLectura(req.body || {})];
    } else {
      resultados = [];
      for (const lectura of await ultimasLecturas()) resultados.push(await revisarLectura(lectura));
    }
    console.log("[alertas]", resultados.join(" | "));
    return res.status(200).send(resultados.join("\n") || "No hay lecturas");
  } catch (error) {
    console.error("[alertas]", error);
    return res.status(500).send("Error en alertas");
  }
};
