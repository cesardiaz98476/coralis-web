// ============================================================
// principal.js — Lógica de la página principal (coralis_principal.html)
//
// Qué hace este archivo, en orden:
//   1) Revisa que haya sesión iniciada (si no, manda al login)
//   2) Cambia entre las secciones Inicio / Consultas / Mi cuenta
//   3) Cierra la sesión
//   4) Mi cuenta: cambiar la contraseña
//   5) Escoger el dispositivo por su ID (ej: CORAL_1)
//   6) Leer los datos de Firebase en tiempo real
//   7) Inicio: coral de salud, gráficas y analítica (ver analitica.js; 1 minuto = 1 día)
//   8) Consultas: resumen de un día, gráfica por horas, tabla y descarga
//   10) Suscribirse a una Raspberry para recibir alertas por correo
//   9) Extra: el ojito de la contraseña
// ============================================================


// ---------- CARGAR FIREBASE Y CHART.JS ----------
// "import" trae funciones de librerías que están en internet.
// Por eso el <script> del HTML tiene type="module".
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,                        // servicio de usuarios (Authentication)
  onAuthStateChanged,             // avisa si hay o no hay sesión
  signOut,                        // cerrar sesión
  EmailAuthProvider,              // arma la "credencial" (correo + contraseña actual)
  reauthenticateWithCredential,   // vuelve a comprobar la contraseña actual
  updatePassword,                 // cambia la contraseña
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
// getDatabase = conectar a la base de datos, ref = "dirección" de una carpeta,
// get = leer una carpeta una sola vez, onValue = escucharla en tiempo real (usa WebSocket),
// set = escribir un dato, remove = borrarlo (para las suscripciones)
import { getDatabase, ref, get, onValue, set, remove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import Chart from "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/auto/+esm";   // librería para las gráficas
import { crearAnalitica } from "./analitica.js";   // analítica del Inicio (1 minuto = 1 día)


// ---------- DATOS DEL PROYECTO DE FIREBASE ----------
// Dicen a qué proyecto conectarse. La apiKey NO es secreta:
// lo que protege los datos son las reglas de la base de datos y el inicio de sesión.
const firebaseConfig = {
  apiKey: "AIzaSyCap_W0d4Tq7CIq9KHL-SjW1cYFK_9FeNY",
  authDomain: "coralis-2ddd8.firebaseapp.com",
  databaseURL: "https://coralis-2ddd8-default-rtdb.firebaseio.com",
  projectId: "coralis-2ddd8",
  appId: "1:741966519586:web:8a94322c2b0086c36f197b",
};

const app = initializeApp(firebaseConfig);   // conecta la página con el proyecto
const auth = getAuth(app);                   // activa el manejo de usuarios
const db = getDatabase(app);                 // conecta con la base de datos (va DESPUÉS de crear app)

// Página del login, a donde se manda al usuario si no tiene sesión
const PAGINA_LOGIN = "coralis_pag.html";

// Zona horaria de Colombia, para que las horas y los días salgan bien
const ZONA = "America/Bogota";


// ============================================================
// 1) REVISAR QUE HAYA SESIÓN
// onAuthStateChanged se ejecuta al abrir la página y cada vez que
// la sesión cambia. "usuario" trae los datos del usuario, o null si no hay sesión.
// ============================================================
onAuthStateChanged(auth, (usuario) => {
  if (usuario) {
    // Hay sesión: mostramos el correo en la barra lateral y en "Mi cuenta"
    document.getElementById("correoUsuario").textContent = usuario.email;
    document.getElementById("correoCuenta").textContent = usuario.email;
  } else {
    // No hay sesión: lo mandamos al login.
    // replace() hace que con "atrás" no pueda volver a esta página.
    window.location.replace(PAGINA_LOGIN);
  }
});


// ============================================================
// 2) CAMBIAR ENTRE SECCIONES
// ============================================================
// Cada sección (id del <section>) con el id de su botón del menú
const SECCIONES = {
  inicio: "btnInicio",
  consultas: "btnConsultas",
  cuenta: "btnCuenta",
};

// mostrarSeccion: deja visible solo la sección elegida y marca su botón
function mostrarSeccion(elegida) {
  for (const seccion in SECCIONES) {
    // hidden = true oculta la sección; solo la elegida queda visible
    document.getElementById(seccion).hidden = seccion !== elegida;
    // La clase "activa" (en el CSS) resalta el botón de la sección que se ve
    document.getElementById(SECCIONES[seccion]).classList.toggle("activa", seccion === elegida);
  }
}

// Cada botón del menú llama a mostrarSeccion con su sección
document.getElementById("btnInicio").addEventListener("click", () => mostrarSeccion("inicio"));
document.getElementById("btnConsultas").addEventListener("click", () => mostrarSeccion("consultas"));
document.getElementById("btnCuenta").addEventListener("click", () => mostrarSeccion("cuenta"));


// ============================================================
// 3) CERRAR SESIÓN
// Pregunta si está seguro, cierra la sesión en Firebase y vuelve al login
// ============================================================
document.getElementById("btnSalir").addEventListener("click", async () => {
  if (confirm("¿Seguro que quieres cerrar sesión?")) {
    await signOut(auth);      // await = espera a que Firebase termine
    window.location.replace(PAGINA_LOGIN);
  }
});


// ============================================================
// 4) MI CUENTA: CAMBIAR LA CONTRASEÑA
// ============================================================

// mostrarMensaje: escribe un aviso en el elemento con ese id.
// Rojo por defecto (error); se le puede pasar verde para éxito.
function mostrarMensaje(id, texto, color = "#e5484d") {
  document.getElementById(id).textContent = texto;
  document.getElementById(id).style.color = color;
}

// revisarClave: comprueba las reglas de la contraseña (las mismas del registro).
// Devuelve el problema en texto, o "" si la contraseña está bien.
// /[0-9]/ busca un número; /[^A-Za-z0-9]/ busca algo que no sea letra ni número (carácter especial).
function revisarClave(clave) {
  if (clave.length < 8) return "La contraseña debe tener mínimo 8 caracteres";
  if (!/[0-9]/.test(clave)) return "La contraseña debe tener al menos un número";
  if (!/[^A-Za-z0-9]/.test(clave)) return "La contraseña debe tener un carácter especial (!@#$%...)";
  return "";
}

// cambiarClave: valida los 3 campos, confirma la contraseña actual y guarda la nueva
async function cambiarClave() {
  const actual = document.getElementById("claveActual").value;
  const nueva = document.getElementById("claveNueva").value;
  const repetida = document.getElementById("claveRepetida").value;

  // Revisiones antes de hablar con Firebase
  if (!actual) return mostrarMensaje("msgCuenta", "Escribe tu contraseña actual");
  const problema = revisarClave(nueva);
  if (problema) return mostrarMensaje("msgCuenta", problema);
  if (nueva !== repetida) return mostrarMensaje("msgCuenta", "Las contraseñas nuevas no coinciden");

  // try/catch: si algo falla en Firebase, el error cae en catch y no se rompe la página
  try {
    // Por seguridad, Firebase pide confirmar la contraseña actual antes de cambiarla
    const usuario = auth.currentUser;
    const credencial = EmailAuthProvider.credential(usuario.email, actual);
    await reauthenticateWithCredential(usuario, credencial);

    await updatePassword(usuario, nueva);   // aquí se cambia de verdad

    mostrarMensaje("msgCuenta", "Contraseña cambiada correctamente", "#2fae7a");
    // Limpia los campos del formulario
    document.querySelectorAll("#cuenta input").forEach((campo) => (campo.value = ""));
  } catch (error) {
    // Firebase devuelve códigos de error; los traducimos a mensajes claros
    if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
      mostrarMensaje("msgCuenta", "La contraseña actual no es correcta");
    } else if (error.code === "auth/too-many-requests") {
      mostrarMensaje("msgCuenta", "Demasiados intentos, espera un momento");
    } else {
      mostrarMensaje("msgCuenta", "Error: " + error.message);
    }
  }
}

document.getElementById("btnCambiarClave").addEventListener("click", cambiarClave);


// ============================================================
// 5) ESCOGER EL DISPOSITIVO POR SU ID
// Cada lectura nueva de la Raspberry trae su "node_id" (ej: CORAL_1).
// Al escribir un ID, buscamos en Firebase si hay lecturas con ese node_id:
// si las hay, entramos; si no, decimos que ese dispositivo no existe.
// ============================================================
// Carpetas de Firebase donde pueden estar las lecturas:
// "mediciones" = donde las guarda el webhook de TTN, "lecturas" = la del puente
const CARPETAS_DATOS = ["mediciones", "lecturas"];

let idActual = null;        // el ID que se está viendo ahora
let todosLosDatos = [];     // todas las lecturas del dispositivo, ordenadas por hora
let dejarDeEscuchar = [];   // funciones para dejar de escuchar el dispositivo anterior

// escogerDispositivo: busca el ID en Firebase; si existe muestra sus datos, si no, avisa
async function escogerDispositivo(evento) {
  evento.preventDefault();   // evita que el formulario recargue la página
  const id = document.getElementById("idDispositivo").value.trim().toUpperCase();
  mostrarMensaje("msgId", "Buscando " + id + " en la base de datos...", "#557a87");

  try {
    // get() lee cada carpeta UNA vez para revisar qué IDs existen
    const lista = [];
    for (const carpeta of CARPETAS_DATOS) {
      const snap = await get(ref(db, carpeta));
      juntarDatos(snap.val(), lista);
    }
    const existe = lista.some((d) => d.nodo === id);

    if (!existe) {
      mostrarMensaje("msgId", "No se encontró el dispositivo \"" + id + "\". Ese nodo no existe, revisa el ID.");
      return;
    }
  } catch (error) {
    mostrarMensaje("msgId", "No se pudo revisar la base de datos (" + error.code + ")");
    return;
  }

  mostrarMensaje("msgId", "");
  idActual = id;
  document.getElementById("resId").textContent = id;
  document.getElementById("formId").hidden = true;       // escondemos el buscador
  document.getElementById("panelDatos").hidden = false;  // mostramos el panel
  escucharDatos();
  revisarSuscripcion();
}

// cambiarId: vuelve a mostrar el buscador para escribir otro ID
function cambiarId() {
  dejarDeEscuchar.forEach((dejar) => dejar());   // dejamos de leer el dispositivo anterior
  dejarDeEscuchar = [];
  idActual = null;
  todosLosDatos = [];
  document.getElementById("panelDatos").hidden = true;
  document.getElementById("formId").hidden = false;
  document.getElementById("idDispositivo").value = "";
  document.getElementById("estadoDatos").textContent = "Escribe el ID del dispositivo para ver sus datos.";
  document.getElementById("fechaConsulta").value = "";
  document.getElementById("resultadoDia").hidden = true;
  mostrarMensaje("msgSuscripcion", "");
}

document.getElementById("formId").addEventListener("submit", escogerDispositivo);
document.getElementById("btnCambiarId").addEventListener("click", cambiarId);


// ============================================================
// 6) LEER LOS DATOS DE FIREBASE EN TIEMPO REAL
// Los datos los escribe el puente (TTN → MQTT → Firebase). La página solo los LEE.
// ============================================================

// leerDato: saca temperatura, pH, turbidez, hora e ID de un dato, sin importar el formato.
// Sirve para el JSON nuevo de la Raspberry (temperature_c, turbidity_ntu, node_id),
// para el formato anterior (temperatura, turbidez) y para el de TTN (decoded_payload).
// Si el objeto no es una medición, devuelve null.
// "??" significa: si lo de la izquierda no existe, usa lo de la derecha.
function leerDato(obj) {
  const d = obj.uplink_message?.decoded_payload ?? obj;
  let hora = d.timestamp ?? obj.timestamp ?? obj.received_at;
  const temp = d.temperature_c ?? d.temperatura ?? d.temperatura_c;
  const ph = d.ph;
  const turb = d.turbidity_ntu ?? d.turbidez;

  if (hora === undefined || (temp === undefined && ph === undefined && turb === undefined)) return null;
  // Si la Raspberry manda el timestamp en segundos (ej: 1762970000), lo pasamos a milisegundos
  if (typeof hora === "number" && hora < 1e12) hora = hora * 1000;
  return {
    hora: new Date(hora),
    temp: Number(temp),
    ph: Number(ph),
    turb: Number(turb),
    nodo: d.node_id ? String(d.node_id).toUpperCase() : null,   // ID de la Raspberry (solo en el JSON nuevo)
    secuencia: d.sequence,                                        // número de envío (solo en el JSON nuevo)
  };
}

// juntarDatos: recorre todas las subcarpetas (función recursiva: se llama a sí misma)
// y mete en "lista" cada medición que encuentre
function juntarDatos(nodo, lista) {
  if (!nodo || typeof nodo !== "object") return;
  const dato = leerDato(nodo);
  if (dato) lista.push(dato);                                           // es una medición: la guardamos
  else Object.values(nodo).forEach((hijo) => juntarDatos(hijo, lista)); // es una carpeta: entramos
}

// escucharDatos: escucha las carpetas de datos; cada vez que llega
// un dato nuevo se actualizan Inicio y Consultas solos
let listasPorCarpeta = {};   // lo último que llegó de cada carpeta

function escucharDatos() {
  document.getElementById("estadoDatos").textContent = "Cargando datos...";
  listasPorCarpeta = {};

  for (const carpeta of CARPETAS_DATOS) {
    // onValue devuelve una función que sirve para dejar de escuchar
    const dejar = onValue(
      ref(db, carpeta),
      (snap) => {
        const lista = [];
        juntarDatos(snap.val(), lista);
        listasPorCarpeta[carpeta] = lista;
        procesarDatos();
      },
      (error) => {
        // Se ejecuta si las reglas no dejan leer (por ejemplo, sin sesión)
        document.getElementById("estadoDatos").textContent = "No se pudieron leer los datos (" + error.code + ")";
      }
    );
    dejarDeEscuchar.push(dejar);
  }
}

// procesarDatos: junta lo de todas las carpetas y actualiza la página
function procesarDatos() {
  const estado = document.getElementById("estadoDatos");
  const lista = Object.values(listasPorCarpeta).flat();

  // Dejamos solo las lecturas de este dispositivo (las viejas sin node_id no entran)
  const delId = lista.filter((d) => d.nodo === idActual);

  // Quitamos repetidos (misma hora) y ordenamos de más viejo a más nuevo
  const unicos = new Map(delId.map((d) => [d.hora.getTime(), d]));
  todosLosDatos = [...unicos.values()].sort((a, b) => a.hora - b.hora);

  if (todosLosDatos.length === 0) {
    estado.textContent = "El dispositivo " + idActual + " todavía no tiene datos.";
    return;
  }

  const ultimo = todosLosDatos[todosLosDatos.length - 1];
  estado.textContent = "Mostrando los datos de " + idActual + ". Se actualiza solo cuando llega un dato nuevo.";
  document.getElementById("resUltima").textContent = horaCompleta(ultimo.hora);

  actualizarInicio();

  // En Consultas: la primera vez se muestra el día de la última lectura;
  // después se vuelve a mostrar el día que se estaba viendo (con los datos nuevos)
  const campoFecha = document.getElementById("fechaConsulta");
  mostrarDia(campoFecha.value || claveDia(ultimo.hora));
}


// ---------- FUNCIONES DE AYUDA PARA FECHAS Y NÚMEROS ----------

// claveDia: convierte una fecha en "AAAA-MM-DD" (hora de Colombia).
// Sirve para agrupar las lecturas por día y para comparar con el calendario.
function claveDia(fecha) {
  return fecha.toLocaleDateString("en-CA", { timeZone: ZONA });   // en-CA da el formato AAAA-MM-DD
}

// horaCompleta: fecha y hora con segundos, ej: 19/10/2026, 10:46:59 p. m.
function horaCompleta(fecha) {
  return fecha.toLocaleString("es-CO", { timeZone: ZONA });
}

// promedio de una lista de números (ignora los que no son número)
function promedio(numeros) {
  const validos = numeros.filter((n) => !isNaN(n));
  if (validos.length === 0) return NaN;
  return validos.reduce((suma, n) => suma + n, 0) / validos.length;
}

// escribirNumero: pone un número con sus decimales, o "--" si no hay
function escribirNumero(id, numero, decimales) {
  document.getElementById(id).textContent = isNaN(numero) ? "--" : numero.toFixed(decimales);
}


// ============================================================
// 7) INICIO: CORAL DE SALUD Y GRÁFICAS POR SEMANA O POR MES
// ============================================================

// En Coralis 1 minuto de medición = 1 día, así que la ventana se cuenta en minutos-días
let diasPeriodo = 7;   // 7, 30, 90 o 365 días

// Cada variable con sus ids en el HTML, su nombre y cuántos decimales mostrar
const VARIABLES = {
  temp: { nombre: "Temperatura", unidad: " °C", valor: "valorTemp", cambio: "cambioTemp", chip: "chipTemp", prom: "promTemp", min: "minTemp", max: "maxTemp", decimales: 1 },
  ph: { nombre: "pH", unidad: "", valor: "valorPh", cambio: "cambioPh", chip: "chipPh", prom: "promPh", min: "minPh", max: "maxPh", decimales: 2 },
  turb: { nombre: "Turbidez", unidad: " NTU", valor: "valorTurb", cambio: "cambioTurb", chip: "chipTurb", prom: "promTurb", min: "minTurb", max: "maxTurb", decimales: 1 },
};

// Colores de las líneas de las gráficas y de sus letras/rayitas (tema claro)
const COLORES = { temp: "#ff6b6b", ph: "#1fa8b0", turb: "#2fae7a" };
const COLOR_LETRAS = "#4b6f7c";
const COLOR_RAYAS = "#e2eff1";

// Letra de las gráficas: la misma de la página (Figtree, ver estilo.css)
Chart.defaults.font.family = '"Figtree", "Segoe UI", system-ui, sans-serif';
Chart.defaults.color = COLOR_LETRAS;


// ************************************************************
// ★★★ ANÁLISIS DE DATOS ★★★
// Aquí es donde la página decide si cada valor está bien o mal,
// y con eso el estado (y el color) del coral.
//
// Rangos sacados de la tabla de la presentación
// "¿Cómo toma decisiones Coralis?":
//
//   Variable      Ideal            Medio                       Crítico
//   pH            7.89 – 8.08      6.5 – 7.89 (o 8.08 – 8.5)   menos de 6.5 (o más de 8.5)
//   Temperatura   25 – 27 °C       18 – 25 o 27 – 29 °C        más de 29 °C (30–31) o menos de 18 °C (16–18)
//   Turbidez      0 – 3 NTU        3 – 5.5 NTU                 más de 5.5 NTU
//
// (Lo que está entre paréntesis no venía en la tabla y lo completamos:
//  el pH alto y los espacios entre rangos de temperatura.)
// ************************************************************
const RANGOS = {
  //      ideal: entre estos dos       crítico: por debajo de "bajo" o por encima de "alto"
  temp: { idealMin: 25,   idealMax: 27,   criticoBajo: 18,   criticoAlto: 29 },
  ph:   { idealMin: 7.89, idealMax: 8.08, criticoBajo: 6.5,  criticoAlto: 8.5 },
  turb: { idealMin: 0,    idealMax: 3,    criticoBajo: -1,   criticoAlto: 5.5 },
};

// Los 3 niveles, de mejor a peor
const NIVELES = ["ideal", "medio", "critico"];
const NOMBRE_NIVEL = { ideal: "Ideal", medio: "Medio", critico: "Crítico" };

// nivelDe: dice si un valor está en nivel "ideal", "medio" o "critico"
//   1) si está entre idealMin e idealMax       -> ideal
//   2) si está por debajo de criticoBajo o
//      por encima de criticoAlto                -> crítico
//   3) cualquier otro valor (está en el medio)  -> medio
function nivelDe(nombre, valor) {
  if (isNaN(valor)) return null;
  const r = RANGOS[nombre];
  if (valor >= r.idealMin && valor <= r.idealMax) return "ideal";
  if (valor < r.criticoBajo || valor > r.criticoAlto) return "critico";
  return "medio";
}

// saludDelCoral: el estado del coral lo decide la PEOR variable
//   todas ideales            -> coral sano (verde)
//   alguna en medio          -> coral en riesgo (pálido)
//   alguna en crítico        -> coral blanqueado (blanco)
function saludDelCoral(valores) {
  const niveles = {};
  for (const nombre in VARIABLES) {
    const n = nivelDe(nombre, valores[nombre]);
    if (n) niveles[nombre] = n;
  }
  const lista = Object.values(niveles);
  if (lista.length === 0) return { clase: "", titulo: "Sin datos", niveles };
  if (lista.includes("critico")) return { clase: "blanqueado", titulo: "Coral blanqueado", niveles };
  if (lista.includes("medio")) return { clase: "riesgo", titulo: "Coral en riesgo", niveles };
  return { clase: "sano", titulo: "Coral saludable", niveles };
}
// ************************ FIN DEL ANÁLISIS ************************


// ---------- EL CORAL QUE CAMBIA DE COLOR ----------
// Dibujo del coral (SVG): abanico de mar atrás, coral ramificado con pólipos,
// esponjas de tubo y coral cerebro adelante, sobre una roca.
// No tiene colores fijos: el CSS (parte 16 de estilo.css) lo pinta con la
// variable --blanqueo (0 = vivo, 1 = blanco hueso) según la clase
// sano / riesgo / blanqueado que pone pintarSaludInicio y mostrarDia.
const DIBUJO_CORAL = `
<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false">
  <g class="abanico">
    <path class="velo" d="M62 174 C38 152 20 120 28 92 C42 78 72 82 88 100 C90 132 78 158 62 174 Z"/>
    <path d="M62 174 C56 152 44 130 31 108"/>
    <path d="M62 174 C60 148 56 122 52 94"/>
    <path d="M62 174 C64 150 70 128 79 106"/>
    <path d="M46 136 C38 128 30 124 23 115"/>
    <path d="M55 124 C48 114 46 104 41 91"/>
    <path d="M68 134 C76 126 82 117 87 104"/>
    <path class="malla" d="M33 110 C44 102 57 98 72 101"/>
    <path class="malla" d="M39 132 C50 123 63 119 78 121"/>
    <path class="malla" d="M48 151 C56 145 64 143 73 145"/>
  </g>
  <g class="rama r1">
    <path d="M104 176 C99 160 91 149 79 139"/>
    <path class="fina" d="M79 139 C71 131 68 119 70 104"/>
    <path class="fina" d="M79 139 C69 139 60 133 55 121"/>
    <circle class="polipo" cx="70" cy="104" r="5"/>
    <circle class="polipo" cx="55" cy="121" r="5"/>
  </g>
  <g class="rama r2">
    <path d="M104 176 C110 160 120 150 132 141"/>
    <path class="fina" d="M132 141 C140 133 143 121 141 106"/>
    <path class="fina" d="M132 141 C143 141 151 134 156 122"/>
    <path class="fina" d="M118 153 C121 141 120 131 125 120"/>
    <circle class="polipo" cx="141" cy="106" r="5"/>
    <circle class="polipo" cx="156" cy="122" r="5"/>
    <circle class="polipo" cx="125" cy="120" r="4.5"/>
  </g>
  <g class="rama r3">
    <path d="M104 176 C103 152 101 129 104 100"/>
    <path class="fina" d="M104 100 C105 90 107 82 110 73"/>
    <path class="fina" d="M103 133 C93 125 88 113 90 98"/>
    <path class="fina" d="M104 115 C114 107 119 97 118 84"/>
    <circle class="polipo" cx="110" cy="73" r="5.5"/>
    <circle class="polipo" cx="90" cy="98" r="5"/>
    <circle class="polipo" cx="118" cy="84" r="5"/>
  </g>
  <path class="roca" d="M22 194 C26 181 43 174 62 176 C78 168 98 170 113 176 C129 168 157 168 171 178 C181 182 186 188 184 194 Z"/>
  <path class="roca-luz" d="M40 180 C50 176 60 176 66 178 M118 174 C130 170 146 170 156 173"/>
  <g class="tubos">
    <rect x="33" y="148" width="13" height="42" rx="6.5"/>
    <rect x="47" y="160" width="11" height="30" rx="5.5"/>
    <ellipse class="boca" cx="39.5" cy="153.5" rx="3.8" ry="2.1"/>
    <ellipse class="boca" cx="52.5" cy="164.5" rx="3.2" ry="1.8"/>
  </g>
  <g class="cerebro">
    <path class="cupula" d="M128 188 C128 167 144 157 159 158 C175 159 185 171 183 188 Z"/>
    <path class="surco" d="M135 181 C139 174 144 178 148 171 C152 165 158 170 162 164 C165 160 170 163 173 160"/>
    <path class="surco" d="M140 188 C145 182 151 186 156 179 C161 173 168 177 173 170 C176 166 179 169 181 166"/>
    <path class="surco" d="M154 188 C159 184 165 187 170 182 C174 178 178 181 181 178"/>
  </g>
  <circle class="burbuja b1" cx="150" cy="86" r="4"/>
  <circle class="burbuja b2" cx="58" cy="72" r="3"/>
  <circle class="burbuja b3" cx="170" cy="120" r="2.5"/>
</svg>`;

// Se pone el dibujo en todos los lugares que tengan class="coral"
document.querySelectorAll(".coral").forEach((caja) => (caja.innerHTML = DIBUJO_CORAL));

// pintarSaludInicio: actualiza la tarjeta grande del coral con la última lectura
function pintarSaludInicio(ultimo) {
  const salud = saludDelCoral(ultimo);
  document.getElementById("tarjetaSalud").className = "tarjeta salud " + salud.clase;
  document.getElementById("saludTitulo").textContent = salud.titulo;

  // Qué variables están en medio y cuáles en crítico
  const enNivel = (nivel) => Object.keys(salud.niveles).filter((n) => salud.niveles[n] === nivel).map((n) => VARIABLES[n].nombre);
  let detalle = "Todos los valores están en el rango ideal para los corales.";
  if (salud.clase === "riesgo") detalle = "En nivel medio: " + enNivel("medio").join(", ") + ". Si empeora, el coral se puede blanquear.";
  if (salud.clase === "blanqueado") detalle = "En nivel crítico: " + enNivel("critico").join(", ") + ". Con estos valores el coral pierde su color.";
  document.getElementById("saludDetalle").textContent = detalle;

  // Un puntico verde, amarillo o rojo por cada variable
  for (const nombre in VARIABLES) {
    const item = document.getElementById("ind" + nombre[0].toUpperCase() + nombre.slice(1));
    item.className = salud.niveles[nombre] ?? "";
  }
}


// ---------- GRÁFICAS ----------
// (Solo visual: estas funciones cambian cómo se VEN las gráficas, no los datos.)

// degradado: relleno debajo de la línea que va del color a transparente
function degradado(color) {
  return (contexto) => {
    const area = contexto.chart.chartArea;
    if (!area) return color + "22";   // la primera vez todavía no hay área
    const relleno = contexto.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
    relleno.addColorStop(0, color + "40");
    relleno.addColorStop(0.8, color + "00");
    return relleno;
  };
}

// franjaIdeal: dibuja detrás de la línea una franja verde con el rango ideal
// (sale de RANGOS), para ver de un vistazo cuándo un valor se sale del umbral.
const franjaIdeal = {
  id: "franjaIdeal",
  // Antes de calcular los ejes: que el eje Y siempre alcance a mostrar la franja
  beforeUpdate(chart) {
    const r = chart.data.datasets[0].rango;
    if (!r) return;
    const margen = (r.idealMax - r.idealMin) * 0.5;
    chart.options.scales.y.suggestedMin = Math.max(0, r.idealMin - margen);
    chart.options.scales.y.suggestedMax = r.idealMax + margen;
  },
  beforeDatasetsDraw(chart) {
    const r = chart.data.datasets[0].rango;
    if (!r) return;
    const { ctx, chartArea: area, scales } = chart;
    const arriba = Math.max(scales.y.getPixelForValue(r.idealMax), area.top);
    const abajo = Math.min(scales.y.getPixelForValue(r.idealMin), area.bottom);
    if (abajo <= arriba) return;
    ctx.save();
    ctx.fillStyle = "rgba(47, 174, 122, 0.11)";
    ctx.fillRect(area.left, arriba, area.right - area.left, abajo - arriba);
    ctx.strokeStyle = "rgba(47, 174, 122, 0.55)";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(area.left, arriba);
    ctx.lineTo(area.right, arriba);
    ctx.moveTo(area.left, abajo);
    ctx.lineTo(area.right, abajo);
    ctx.stroke();
    ctx.restore();
  },
};

// crearGrafica: crea una gráfica de línea vacía en el <canvas> indicado y la devuelve.
// rango = el rango ideal de la variable (para la franja verde)
// proporcion = cuántas veces más ancha que alta (2 si no se dice nada)
function crearGrafica(idCanvas, nombre, color, rango, proporcion = 2) {
  return new Chart(document.getElementById(idCanvas), {
    type: "line",
    data: {
      labels: [],                        // eje X; se llena después
      datasets: [{
        label: nombre,
        data: [],                        // eje Y; se llena después
        rango: rango,                    // para la franja del rango ideal
        borderColor: color,
        backgroundColor: degradado(color),
        fill: true,
        tension: 0.35,                   // línea un poco curva
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: color,
        pointBorderColor: "#ffffff",
        pointBorderWidth: 1.5,
        borderWidth: 2.5,
        spanGaps: true,                  // si un día no tiene datos, une los puntos de al lado
      }],
    },
    plugins: [franjaIdeal],
    options: {
      aspectRatio: proporcion,
      interaction: { mode: "index", intersect: false },   // el recuadro sale al pasar cerca
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#062a3a",
          titleColor: "#8fe3dd",
          bodyColor: "#ffffff",
          titleFont: { weight: "600" },
          bodyFont: { weight: "700", size: 13 },
          padding: 10,
          cornerRadius: 10,
          displayColors: false,
        },
      },
      scales: {
        x: {
          ticks: { color: COLOR_LETRAS, maxTicksLimit: 6, maxRotation: 0 },
          grid: { display: false },
          border: { color: COLOR_RAYAS },
        },
        y: {
          ticks: { color: COLOR_LETRAS, maxTicksLimit: 5 },
          grid: { color: COLOR_RAYAS },
          border: { display: false },
        },
      },
    },
  });
}

// Las 3 gráficas de Inicio se crean una sola vez y luego solo se les cambian los datos
const graficas = {
  temp: crearGrafica("graficaTemp", "Temperatura (°C)", COLORES.temp, RANGOS.temp),
  ph: crearGrafica("graficaPh", "pH", COLORES.ph, RANGOS.ph),
  turb: crearGrafica("graficaTurb", "Turbidez (NTU)", COLORES.turb, RANGOS.turb),
};

// La analítica (analitica.js) recibe lo que necesita de este archivo
const analitica = crearAnalitica({ Chart, RANGOS, VARIABLES, nivelDe, horaCompleta });

// actualizarInicio: arma la serie de días (1 minuto = 1 día), toma la ventana
// escogida y actualiza gráficas, tarjetas, mínimo/máximo, estado, el coral y la analítica
function actualizarInicio() {
  if (todosLosDatos.length === 0) return;

  const ultimo = todosLosDatos[todosLosDatos.length - 1];
  const anterior = todosLosDatos[todosLosDatos.length - 2];
  const serie = analitica.serieDiaria(todosLosDatos);       // un punto por minuto = por día
  const ventana = analitica.ventana(serie, diasPeriodo);     // los últimos N días
  document.getElementById("resCantidad").textContent = ventana.lecturas;

  // Eje X: el número de día
  const etiquetas = ventana.casillas.map((c) => "Día " + c.dia.toLocaleString("es-CO"));

  for (const nombre in VARIABLES) {
    const v = VARIABLES[nombre];

    // Valor de cada día (null si ese día no llegó lectura)
    graficas[nombre].data.labels = etiquetas;
    graficas[nombre].data.datasets[0].data = ventana.casillas.map((c) =>
      c.dato && !isNaN(c.dato[nombre]) ? Number(c.dato[nombre].toFixed(v.decimales)) : null);
    graficas[nombre].data.datasets[0].pointRadius = ventana.casillas.length > 40 ? 0 : 3;
    graficas[nombre].update();

    // Valor más nuevo y cuánto cambió respecto al día anterior
    ponerValor(v, ultimo[nombre], anterior ? anterior[nombre] : NaN);

    // Promedio, mínimo y máximo de la ventana
    const valores = ventana.dias.map((d) => d[nombre]).filter((n) => !isNaN(n));
    escribirNumero(v.prom, promedio(valores), v.decimales);
    escribirNumero(v.min, valores.length ? Math.min(...valores) : NaN, v.decimales);
    escribirNumero(v.max, valores.length ? Math.max(...valores) : NaN, v.decimales);

    ponerEstado(v.chip, nombre, ultimo[nombre]);
  }

  pintarSaludInicio(ultimo);
  analitica.pintar(serie, ventana);
}

// diaCorto: de "2026-11-12" a "12/11"
function diaCorto(clave) {
  return clave.slice(8, 10) + "/" + clave.slice(5, 7);
}

// ponerValor: escribe el valor más nuevo en la tarjeta y debajo
// cuánto cambió respecto al anterior (▲ subió, ▼ bajó, ● igual)
function ponerValor(v, actual, anterior) {
  escribirNumero(v.valor, actual, v.decimales);
  const cambio = document.getElementById(v.cambio);
  if (isNaN(actual) || isNaN(anterior)) {
    cambio.textContent = "";
    return;
  }
  const diferencia = actual - anterior;
  const flecha = diferencia > 0 ? "▲" : diferencia < 0 ? "▼" : "●";
  cambio.textContent = flecha + " " + Math.abs(diferencia).toFixed(v.decimales) + " desde el día anterior";
}

// ponerEstado: la etiqueta de color arriba a la derecha de cada tarjeta
function ponerEstado(idChip, nombre, valor) {
  const chip = document.getElementById(idChip);
  if (isNaN(valor)) {
    chip.textContent = "";
    chip.className = "chip";
    return;
  }
  const nivel = nivelDe(nombre, valor);
  chip.textContent = NOMBRE_NIVEL[nivel];
  chip.className = "chip " + nivel;   // el CSS les da color verde, amarillo o rojo
}

// marcarBoton: pinta el botón escogido de un grupo (Semana/Mes, Temp/pH/Turb)
function marcarBoton(ids, elegido) {
  ids.forEach((id) => document.getElementById(id).classList.toggle("activa", id === elegido));
}

// cambiarPeriodo: los botones de la ventana (7, 30, 90 días y 1 año)
const BOTONES_PERIODO = { 7: "btnSemana", 30: "btnMes", 90: "btnTrimestre", 365: "btnAnio" };
function cambiarPeriodo(dias) {
  diasPeriodo = dias;
  marcarBoton(Object.values(BOTONES_PERIODO), BOTONES_PERIODO[dias]);
  actualizarInicio();
}

document.getElementById("btnSemana").addEventListener("click", () => cambiarPeriodo(7));
document.getElementById("btnMes").addEventListener("click", () => cambiarPeriodo(30));
document.getElementById("btnTrimestre").addEventListener("click", () => cambiarPeriodo(90));
document.getElementById("btnAnio").addEventListener("click", () => cambiarPeriodo(365));


// ============================================================
// 8) CONSULTAS: TODO SOBRE UN DÍA
// Resumen, coral de ese día, gráfica por horas y la tabla con la
// hora exacta (timestamp) en que la Raspberry tomó cada dato
// ============================================================

let variableDia = "temp";   // qué variable se ve en la gráfica del día
let lecturasDelDia = [];    // las lecturas del día que se está viendo

// La gráfica del día se crea una sola vez
const graficaDia = crearGrafica("graficaDia", "Temperatura (°C)", COLORES.temp, RANGOS.temp, 3.5);   // más ancha que alta

// diasConDatos: lista de días (AAAA-MM-DD) que tienen al menos una lectura
function diasConDatos() {
  return [...new Set(todosLosDatos.map((d) => claveDia(d.hora)))];
}

// mostrarDia: llena toda la sección de Consultas con el día escogido
function mostrarDia(dia) {
  const resultado = document.getElementById("resultadoDia");
  document.getElementById("fechaConsulta").value = dia;

  if (!idActual) {
    resultado.hidden = true;
    return mostrarMensaje("msgConsulta", "Primero escribe el ID del dispositivo en Inicio.");
  }

  // Texto de arriba: cuántos días tienen datos y desde cuándo
  const dias = diasConDatos();
  if (dias.length > 0) {
    document.getElementById("estadoConsulta").textContent =
      idActual + " tiene mediciones en " + dias.length + " fechas del calendario, del " + diaCorto(dias[0]) + " al " + diaCorto(dias[dias.length - 1]) + ".";
  }

  lecturasDelDia = todosLosDatos.filter((d) => claveDia(d.hora) === dia);

  if (lecturasDelDia.length === 0) {
    resultado.hidden = true;
    return mostrarMensaje("msgConsulta", "No hay lecturas de " + idActual + " ese día. Prueba con las flechas ◀ ▶.");
  }
  mostrarMensaje("msgConsulta", "");

  // --- Resumen: cantidad y primera/última hora ---
  const primera = lecturasDelDia[0].hora;
  const ultima = lecturasDelDia[lecturasDelDia.length - 1].hora;
  document.getElementById("diaCantidad").textContent = lecturasDelDia.length;
  document.getElementById("diaRango").textContent = soloHora(primera) + " a " + soloHora(ultima);

  // --- Resumen de cada variable: promedio y mínimo/máximo ---
  const promedios = {};
  for (const nombre in VARIABLES) {
    const v = VARIABLES[nombre];
    const valores = lecturasDelDia.map((d) => d[nombre]).filter((n) => !isNaN(n));
    promedios[nombre] = promedio(valores);
    const id = "dia" + nombre[0].toUpperCase() + nombre.slice(1);   // diaTemp, diaPh, diaTurb
    document.getElementById(id).textContent = isNaN(promedios[nombre]) ? "--" : promedios[nombre].toFixed(v.decimales) + v.unidad;
    document.getElementById(id + "Rango").textContent = valores.length
      ? "mín " + Math.min(...valores).toFixed(v.decimales) + " · máx " + Math.max(...valores).toFixed(v.decimales)
      : "";
  }

  // --- Coral de ese día (con los promedios del día) ---
  const salud = saludDelCoral(promedios);
  document.getElementById("saludDia").className = "tarjeta mini-coral " + salud.clase;
  document.getElementById("saludDiaTexto").textContent = salud.titulo;

  pintarGraficaDia();
  pintarTabla();
  resultado.hidden = false;
}

// soloHora: de una fecha saca solo la hora, ej: 3:00 p. m.
function soloHora(fecha) {
  return fecha.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: ZONA });
}

// pintarGraficaDia: la gráfica de la variable escogida, hora por hora
function pintarGraficaDia() {
  const v = VARIABLES[variableDia];
  const dataset = graficaDia.data.datasets[0];
  graficaDia.data.labels = lecturasDelDia.map((d) => soloHora(d.hora));
  dataset.data = lecturasDelDia.map((d) => (isNaN(d[variableDia]) ? null : d[variableDia]));
  dataset.label = v.nombre;
  dataset.borderColor = COLORES[variableDia];
  dataset.pointBackgroundColor = COLORES[variableDia];
  dataset.backgroundColor = degradado(COLORES[variableDia]);
  dataset.rango = RANGOS[variableDia];   // la franja del rango ideal de esa variable
  dataset.pointRadius = lecturasDelDia.length > 60 ? 0 : 3;   // con muchas lecturas, solo la línea
  graficaDia.update();
}

// pintarTabla: una fila por lectura (la más nueva arriba).
// Los valores fuera de rango se pintan de rojo.
function pintarTabla() {
  const cuerpo = document.getElementById("cuerpoTabla");
  cuerpo.innerHTML = "";
  [...lecturasDelDia].reverse().forEach((d) => {
    const fila = document.createElement("tr");

    const celdaHora = document.createElement("td");
    celdaHora.textContent = horaCompleta(d.hora);
    fila.appendChild(celdaHora);

    const celdaSecuencia = document.createElement("td");
    celdaSecuencia.textContent = d.secuencia ?? "--";
    fila.appendChild(celdaSecuencia);

    for (const nombre in VARIABLES) {
      const celda = document.createElement("td");
      const valor = d[nombre];
      celda.textContent = isNaN(valor) ? "--" : valor.toFixed(VARIABLES[nombre].decimales);
      celda.className = nivelDe(nombre, valor) ?? "";   // medio = amarillo, crítico = rojo
      fila.appendChild(celda);
    }
    cuerpo.appendChild(fila);
  });
}

// moverDia: las flechas ◀ ▶ saltan al día anterior/siguiente que tenga datos
function moverDia(direccion) {
  const dias = diasConDatos();
  if (dias.length === 0) return;
  const actual = document.getElementById("fechaConsulta").value;
  let destino;
  if (direccion < 0) destino = [...dias].reverse().find((d) => d < actual) ?? dias[0];
  else destino = dias.find((d) => d > actual) ?? dias[dias.length - 1];
  mostrarDia(destino);
}

// descargarCSV: baja un archivo .csv (se abre en Excel) con las lecturas del día
function descargarCSV() {
  const filas = [["timestamp", "fecha_hora", "secuencia", "temperatura_c", "ph", "turbidez_ntu"]];
  lecturasDelDia.forEach((d) => filas.push([d.hora.toISOString(), horaCompleta(d.hora), d.secuencia ?? "", d.temp, d.ph, d.turb]));
  const texto = filas.map((f) => f.map((x) => '"' + x + '"').join(",")).join("\n");

  const enlace = document.createElement("a");
  enlace.href = URL.createObjectURL(new Blob([texto], { type: "text/csv" }));
  enlace.download = idActual + "_" + document.getElementById("fechaConsulta").value + ".csv";
  enlace.click();
}

// Botones de Consultas
document.getElementById("formConsulta").addEventListener("submit", (evento) => {
  evento.preventDefault();
  mostrarDia(document.getElementById("fechaConsulta").value);
});
document.getElementById("btnDiaAnterior").addEventListener("click", () => moverDia(-1));
document.getElementById("btnDiaSiguiente").addEventListener("click", () => moverDia(1));
document.getElementById("btnDescargar").addEventListener("click", descargarCSV);

// Botones Temperatura / pH / Turbidez de la gráfica del día
const BOTONES_DIA = { temp: "btnVerTemp", ph: "btnVerPh", turb: "btnVerTurb" };
for (const nombre in BOTONES_DIA) {
  document.getElementById(BOTONES_DIA[nombre]).addEventListener("click", () => {
    variableDia = nombre;
    marcarBoton(Object.values(BOTONES_DIA), BOTONES_DIA[nombre]);
    pintarGraficaDia();
  });
}


// ============================================================
// 9) BOTÓN DE OJITO PARA VER LA CONTRASEÑA (igual que en el login)
// A cada campo de contraseña le crea un botón 👁️ que cambia
// el tipo del campo entre "password" (puntitos) y "text" (se ve).
// ============================================================
document.querySelectorAll('input[type="password"]').forEach((campo) => {
  // Envolvemos el campo en una caja para poner el botón encima (ver .campo-clave en el CSS)
  const caja = document.createElement("div");
  caja.className = "campo-clave";
  campo.parentNode.insertBefore(caja, campo);
  caja.appendChild(campo);

  const ojo = document.createElement("button");
  ojo.type = "button";
  ojo.className = "ojo";
  ojo.textContent = "👁️";
  ojo.title = "Mostrar contraseña";
  caja.appendChild(ojo);

  ojo.addEventListener("click", () => {
    const oculta = campo.type === "password";
    campo.type = oculta ? "text" : "password";
    ojo.textContent = oculta ? "🙈" : "👁️";
    ojo.title = oculta ? "Ocultar contraseña" : "Mostrar contraseña";
  });
});


// ============================================================
// 10) SUSCRIBIRSE A UNA RASPBERRY (ALERTAS POR CORREO)
// La página solo guarda quién está suscrito en Firebase:
//   suscripciones/CORAL_1/<uid> = { correo, desde }
// El que manda los correos es el puente (Python), que revisa cada lectura
// nueva y, si el coral cambia de estado, les escribe a los suscritos.
// ============================================================
let suscrito = false;   // si el usuario está suscrito al dispositivo que está viendo

// rutaSuscripcion: dónde se guarda la suscripción del usuario a este dispositivo
function rutaSuscripcion() {
  return "suscripciones/" + idActual + "/" + auth.currentUser.uid;
}

// pintarBotonSuscripcion: cambia el texto y el color del botón según el estado
function pintarBotonSuscripcion() {
  const boton = document.getElementById("btnSuscribir");
  boton.textContent = suscrito ? "🔕 Dejar de recibir alertas" : "🔔 Recibir alertas por correo";
  boton.classList.toggle("activa", suscrito);
  boton.title = suscrito
    ? "Te llega un correo a " + auth.currentUser.email + " cuando el coral cambie de estado"
    : "Suscríbete para que te llegue un correo cuando el coral cambie de estado";
}

// revisarSuscripcion: al entrar a un dispositivo, mira si el usuario ya estaba suscrito
async function revisarSuscripcion() {
  try {
    const snap = await get(ref(db, rutaSuscripcion()));
    suscrito = snap.exists();
  } catch (error) {
    suscrito = false;
  }
  pintarBotonSuscripcion();
}

// cambiarSuscripcion: suscribe o quita la suscripción (botón de la franja de resumen)
async function cambiarSuscripcion() {
  const boton = document.getElementById("btnSuscribir");
  boton.disabled = true;   // evita doble clic mientras Firebase responde
  try {
    if (suscrito) {
      await remove(ref(db, rutaSuscripcion()));
      suscrito = false;
      mostrarMensaje("msgSuscripcion", "Listo, ya no te llegarán alertas de " + idActual + ".", "#557a87");
    } else {
      await set(ref(db, rutaSuscripcion()), {
        correo: auth.currentUser.email,
        desde: new Date().toISOString(),
      });
      suscrito = true;
      mostrarMensaje("msgSuscripcion", "Te llegará un correo a " + auth.currentUser.email + " cuando el coral de " + idActual + " cambie de estado.", "#2fae7a");
    }
  } catch (error) {
    mostrarMensaje("msgSuscripcion", "No se pudo guardar la suscripción (" + error.code + ")");
  }
  boton.disabled = false;
  pintarBotonSuscripcion();
}

document.getElementById("btnSuscribir").addEventListener("click", cambiarSuscripcion);
