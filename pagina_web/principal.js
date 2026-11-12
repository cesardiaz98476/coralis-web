// ============================================================
// principal.js — Lógica de la página principal (coralis_principal.html)
//
// Qué hace este archivo, en orden:
//   1) Revisa que haya sesión iniciada (si no, manda al login)
//   2) Cambia entre las secciones Inicio / Consultas / Sobre nosotros / Mi cuenta
//   3) Cierra la sesión
//   4) Mi cuenta: cambiar la contraseña
//   5) Escoger el dispositivo por su ID (ej: CORAL_1)
//   6) Leer los datos de Firebase en tiempo real
//   7) Inicio: coral de salud, gráficas por semana o por mes, resumen y estado
//   8) Consultas: resumen de un día, gráfica por horas, tabla y descarga
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
// onValue = escuchar esa carpeta en tiempo real (usa WebSocket)
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import Chart from "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/auto/+esm";   // librería para las gráficas


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
  nosotros: "btnNosotros",
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
document.getElementById("btnNosotros").addEventListener("click", () => mostrarSeccion("nosotros"));
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
// En Firebase los datos todavía no están guardados por ID, así que aquí
// decimos a mano qué ID existe y en qué carpeta están sus datos.
// Cuando tengan más Raspberry, se agrega una línea por cada una.
// ============================================================
const DISPOSITIVOS = {
  CORAL_1: "lecturas",
};

let idActual = null;        // el ID que se está viendo ahora
let todosLosDatos = [];     // todas las lecturas del dispositivo, ordenadas por hora
let dejarDeEscuchar = null; // función para dejar de escuchar el dispositivo anterior

// escogerDispositivo: revisa el ID escrito; si existe muestra sus datos, si no, avisa
function escogerDispositivo(evento) {
  evento.preventDefault();   // evita que el formulario recargue la página
  const id = document.getElementById("idDispositivo").value.trim().toUpperCase();

  if (!DISPOSITIVOS[id]) {
    mostrarMensaje("msgId", "No se encontró el dispositivo \"" + id + "\". Ese nodo no existe, revisa el ID.");
    return;
  }

  mostrarMensaje("msgId", "");
  idActual = id;
  document.getElementById("resId").textContent = id;
  document.getElementById("formId").hidden = true;       // escondemos el buscador
  document.getElementById("panelDatos").hidden = false;  // mostramos el panel
  escucharDatos(DISPOSITIVOS[id]);
}

// cambiarId: vuelve a mostrar el buscador para escribir otro ID
function cambiarId() {
  if (dejarDeEscuchar) dejarDeEscuchar();   // dejamos de leer el dispositivo anterior
  idActual = null;
  todosLosDatos = [];
  document.getElementById("panelDatos").hidden = true;
  document.getElementById("formId").hidden = false;
  document.getElementById("idDispositivo").value = "";
  document.getElementById("estadoDatos").textContent = "Escribe el ID del dispositivo para ver sus datos.";
  document.getElementById("fechaConsulta").value = "";
  document.getElementById("resultadoDia").hidden = true;
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
  return { hora: new Date(hora), temp: Number(temp), ph: Number(ph), turb: Number(turb), nodo: d.node_id };
}

// juntarDatos: recorre todas las subcarpetas (función recursiva: se llama a sí misma)
// y mete en "lista" cada medición que encuentre
function juntarDatos(nodo, lista) {
  if (!nodo || typeof nodo !== "object") return;
  const dato = leerDato(nodo);
  if (dato) lista.push(dato);                                           // es una medición: la guardamos
  else Object.values(nodo).forEach((hijo) => juntarDatos(hijo, lista)); // es una carpeta: entramos
}

// escucharDatos: escucha la carpeta del dispositivo; cada vez que llega
// un dato nuevo se actualizan Inicio y Consultas solos
function escucharDatos(carpeta) {
  const estado = document.getElementById("estadoDatos");
  estado.textContent = "Cargando datos...";

  // onValue devuelve una función que sirve para dejar de escuchar
  dejarDeEscuchar = onValue(
    ref(db, carpeta),
    (snap) => {
      const lista = [];
      juntarDatos(snap.val(), lista);

      // Si el dato trae node_id, dejamos solo los de este dispositivo
      const delId = lista.filter((d) => !d.nodo || String(d.nodo).toUpperCase() === idActual);

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
    },
    (error) => {
      // Se ejecuta si las reglas no dejan leer (por ejemplo, sin sesión)
      estado.textContent = "No se pudieron leer los datos (" + error.code + ")";
    }
  );
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

let diasPeriodo = 7;   // 7 = semana, 30 = mes

// Rangos de referencia para arrecifes de coral (se pueden cambiar aquí).
// Si el valor está dentro del rango, la tarjeta dice "Normal".
const RANGOS = {
  temp: { min: 23, max: 29 },
  ph: { min: 7.8, max: 8.5 },
  turb: { min: 0, max: 5 },
};

// Cada variable con sus ids en el HTML, su nombre y cuántos decimales mostrar
const VARIABLES = {
  temp: { nombre: "Temperatura", unidad: " °C", valor: "valorTemp", cambio: "cambioTemp", chip: "chipTemp", prom: "promTemp", min: "minTemp", max: "maxTemp", decimales: 1 },
  ph: { nombre: "pH", unidad: "", valor: "valorPh", cambio: "cambioPh", chip: "chipPh", prom: "promPh", min: "minPh", max: "maxPh", decimales: 2 },
  turb: { nombre: "Turbidez", unidad: " NTU", valor: "valorTurb", cambio: "cambioTurb", chip: "chipTurb", prom: "promTurb", min: "minTurb", max: "maxTurb", decimales: 1 },
};

// Colores de las líneas de las gráficas y de sus letras/rayitas (tema claro)
const COLORES = { temp: "#ff6b6b", ph: "#1fa8b0", turb: "#2fae7a" };
const COLOR_LETRAS = "#557a87";
const COLOR_RAYAS = "#e1eef1";

// enRango: true si el valor está dentro del rango de referencia
function enRango(nombre, valor) {
  return !isNaN(valor) && valor >= RANGOS[nombre].min && valor <= RANGOS[nombre].max;
}


// ---------- EL CORAL QUE CAMBIA DE COLOR ----------
// Dibujo del coral (SVG). Cada parte usa un color del CSS (--c1, --c2, --c3),
// así el CSS lo pinta colorido (sano), pálido (en riesgo) o blanco (blanqueado).
const DIBUJO_CORAL = `
<svg viewBox="0 0 200 200" aria-hidden="true">
  <circle class="burbuja b1" cx="40" cy="150" r="5"/>
  <circle class="burbuja b2" cx="160" cy="140" r="4"/>
  <circle class="burbuja b3" cx="150" cy="80" r="3"/>
  <g class="rama r1">
    <path d="M100 190 C98 160 92 140 70 120 C58 110 52 95 56 78" />
    <path d="M70 120 C55 118 40 108 36 92" />
    <path d="M84 134 C90 115 104 104 104 84" />
  </g>
  <g class="rama r2">
    <path d="M100 190 C104 160 112 140 134 124 C148 114 152 98 148 82" />
    <path d="M134 124 C150 124 162 114 166 98" />
    <path d="M118 140 C114 120 120 104 128 92" />
  </g>
  <g class="rama r3">
    <path d="M100 190 C100 150 100 110 100 60" />
    <path d="M100 110 C88 100 84 86 86 70" />
    <path d="M100 96 C112 88 116 74 114 60" />
  </g>
  <ellipse class="roca" cx="100" cy="192" rx="62" ry="10"/>
</svg>`;

// Se pone el dibujo en todos los lugares que tengan class="coral"
document.querySelectorAll(".coral").forEach((caja) => (caja.innerHTML = DIBUJO_CORAL));

// saludDelCoral: según cuántos valores están en rango, decide el estado del coral
//   3 de 3 en rango -> sano (colorido)
//   1 o 2           -> en riesgo (pálido)
//   0               -> blanqueado (blanco)
function saludDelCoral(valores) {
  const nombres = Object.keys(VARIABLES).filter((n) => !isNaN(valores[n]));   // solo los que tienen dato
  const bien = nombres.filter((n) => enRango(n, valores[n]));
  if (nombres.length === 0) return { clase: "", titulo: "Sin datos", bien, nombres };
  if (bien.length === nombres.length) return { clase: "sano", titulo: "Coral saludable", bien, nombres };
  if (bien.length === 0) return { clase: "blanqueado", titulo: "Coral blanqueado", bien, nombres };
  return { clase: "riesgo", titulo: "Coral en riesgo", bien, nombres };
}

// pintarSaludInicio: actualiza la tarjeta grande del coral con la última lectura
function pintarSaludInicio(ultimo) {
  const salud = saludDelCoral(ultimo);
  document.getElementById("tarjetaSalud").className = "tarjeta salud " + salud.clase;
  document.getElementById("saludTitulo").textContent = salud.titulo;

  const fuera = salud.nombres.filter((n) => !salud.bien.includes(n)).map((n) => VARIABLES[n].nombre);
  let detalle = "Todos los valores están dentro del rango sano para los corales.";
  if (salud.clase === "riesgo") detalle = "Fuera de rango: " + fuera.join(", ") + ". Si sigue así, el coral se puede blanquear.";
  if (salud.clase === "blanqueado") detalle = "Todos los valores están fuera de rango (" + fuera.join(", ") + "). Así el coral pierde su color.";
  document.getElementById("saludDetalle").textContent = detalle;

  // Un puntico verde o rojo por cada variable
  for (const nombre in VARIABLES) {
    const item = document.getElementById("ind" + nombre[0].toUpperCase() + nombre.slice(1));
    item.className = isNaN(ultimo[nombre]) ? "" : enRango(nombre, ultimo[nombre]) ? "bien" : "alerta";
  }
}


// ---------- GRÁFICAS ----------
// crearGrafica: crea una gráfica de línea vacía en el <canvas> indicado y la devuelve.
// proporcion = cuántas veces más ancha que alta (2 si no se dice nada)
function crearGrafica(idCanvas, nombre, color, proporcion = 2) {
  return new Chart(document.getElementById(idCanvas), {
    type: "line",
    data: {
      labels: [],                        // eje X; se llena después
      datasets: [{
        label: nombre,
        data: [],                        // eje Y; se llena después
        borderColor: color,
        backgroundColor: color + "26",   // el mismo color pero transparente (relleno)
        fill: true,
        tension: 0.3,                    // línea un poco curva
        pointRadius: 3,
        pointBackgroundColor: color,
        borderWidth: 2.5,
        spanGaps: true,                  // si un día no tiene datos, une los puntos de al lado
      }],
    },
    options: {
      aspectRatio: proporcion,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: COLOR_LETRAS, maxTicksLimit: 8 }, grid: { color: COLOR_RAYAS } },
        y: { ticks: { color: COLOR_LETRAS }, grid: { color: COLOR_RAYAS } },
      },
    },
  });
}

// Las 3 gráficas de Inicio se crean una sola vez y luego solo se les cambian los datos
const graficas = {
  temp: crearGrafica("graficaTemp", "Temperatura (°C)", COLORES.temp),
  ph: crearGrafica("graficaPh", "pH", COLORES.ph),
  turb: crearGrafica("graficaTurb", "Turbidez (NTU)", COLORES.turb),
};

// actualizarInicio: arma los días del periodo, saca el promedio de cada día
// y actualiza gráficas, tarjetas, mínimo/máximo, estado y el coral
function actualizarInicio() {
  if (todosLosDatos.length === 0) return;

  // El periodo termina en el día de la última lectura y va hacia atrás
  const ultimo = todosLosDatos[todosLosDatos.length - 1];
  const dias = [];
  for (let i = diasPeriodo - 1; i >= 0; i--) {
    const dia = new Date(ultimo.hora.getTime() - i * 24 * 60 * 60 * 1000);
    dias.push(claveDia(dia));
  }

  // Solo las lecturas que caen dentro de esos días
  const delPeriodo = todosLosDatos.filter((d) => dias.includes(claveDia(d.hora)));
  document.getElementById("resCantidad").textContent = delPeriodo.length;

  // Eje X: el día en formato corto, ej: 12/11
  const etiquetas = dias.map(diaCorto);

  for (const nombre in VARIABLES) {
    const v = VARIABLES[nombre];

    // Promedio de cada día (null si ese día no hubo lecturas)
    const porDia = dias.map((clave) => {
      const delDia = delPeriodo.filter((d) => claveDia(d.hora) === clave).map((d) => d[nombre]);
      const p = promedio(delDia);
      return isNaN(p) ? null : Number(p.toFixed(v.decimales));
    });

    graficas[nombre].data.labels = etiquetas;
    graficas[nombre].data.datasets[0].data = porDia;
    graficas[nombre].update();

    // Valor más nuevo y cuánto cambió respecto a la lectura anterior
    const anterior = todosLosDatos[todosLosDatos.length - 2];
    ponerValor(v, ultimo[nombre], anterior ? anterior[nombre] : NaN);

    // Promedio, mínimo y máximo de todo el periodo
    const valores = delPeriodo.map((d) => d[nombre]).filter((n) => !isNaN(n));
    escribirNumero(v.prom, promedio(valores), v.decimales);
    escribirNumero(v.min, valores.length ? Math.min(...valores) : NaN, v.decimales);
    escribirNumero(v.max, valores.length ? Math.max(...valores) : NaN, v.decimales);

    ponerEstado(v.chip, nombre, ultimo[nombre]);
  }

  pintarSaludInicio(ultimo);
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
  cambio.textContent = flecha + " " + Math.abs(diferencia).toFixed(v.decimales) + " desde la lectura anterior";
}

// ponerEstado: la etiqueta de color arriba a la derecha de cada tarjeta
function ponerEstado(idChip, nombre, valor) {
  const chip = document.getElementById(idChip);
  if (isNaN(valor)) {
    chip.textContent = "";
    chip.className = "chip";
    return;
  }
  const normal = enRango(nombre, valor);
  chip.textContent = normal ? "Normal" : "Fuera de rango";
  chip.className = "chip " + (normal ? "bien" : "alerta");   // el CSS les da color verde o rojo
}

// marcarBoton: pinta el botón escogido de un grupo (Semana/Mes, Temp/pH/Turb)
function marcarBoton(ids, elegido) {
  ids.forEach((id) => document.getElementById(id).classList.toggle("activa", id === elegido));
}

// cambiarPeriodo: los botones Semana / Mes
function cambiarPeriodo(dias) {
  diasPeriodo = dias;
  marcarBoton(["btnSemana", "btnMes"], dias === 7 ? "btnSemana" : "btnMes");
  actualizarInicio();
}

document.getElementById("btnSemana").addEventListener("click", () => cambiarPeriodo(7));
document.getElementById("btnMes").addEventListener("click", () => cambiarPeriodo(30));


// ============================================================
// 8) CONSULTAS: TODO SOBRE UN DÍA
// Resumen, coral de ese día, gráfica por horas y la tabla con la
// hora exacta (timestamp) en que la Raspberry tomó cada dato
// ============================================================

let variableDia = "temp";   // qué variable se ve en la gráfica del día
let lecturasDelDia = [];    // las lecturas del día que se está viendo

// La gráfica del día se crea una sola vez
const graficaDia = crearGrafica("graficaDia", "Temperatura (°C)", COLORES.temp, 3.5);   // más ancha que alta

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
      idActual + " tiene datos de " + dias.length + " días, del " + diaCorto(dias[0]) + " al " + diaCorto(dias[dias.length - 1]) + ".";
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
  dataset.backgroundColor = COLORES[variableDia] + "26";
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

    for (const nombre in VARIABLES) {
      const celda = document.createElement("td");
      const valor = d[nombre];
      celda.textContent = isNaN(valor) ? "--" : valor.toFixed(VARIABLES[nombre].decimales);
      if (!isNaN(valor) && !enRango(nombre, valor)) celda.className = "fuera";
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
  const filas = [["timestamp", "fecha_hora", "temperatura_c", "ph", "turbidez_ntu"]];
  lecturasDelDia.forEach((d) => filas.push([d.hora.toISOString(), horaCompleta(d.hora), d.temp, d.ph, d.turb]));
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
