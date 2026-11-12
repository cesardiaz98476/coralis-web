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
//   7) Inicio: gráficas por semana o por mes, resumen y estado
//   8) Consultas: todas las lecturas de un día con su hora exacta
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
function mostrarMensaje(id, texto, color = "#ff8a8a") {
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

    mostrarMensaje("msgCuenta", "Contraseña cambiada correctamente", "#7cc8a0");
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

      // En Consultas dejamos escogido, por defecto, el día de la última lectura
      const campoFecha = document.getElementById("fechaConsulta");
      if (!campoFecha.value) campoFecha.value = claveDia(ultimo.hora);
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
// 7) INICIO: GRÁFICAS POR SEMANA O POR MES
// ============================================================

let diasPeriodo = 7;   // 7 = semana, 30 = mes

// Rangos de referencia para arrecifes de coral (se pueden cambiar aquí).
// Si el valor está dentro del rango, la tarjeta dice "Normal".
const RANGOS = {
  temp: { min: 23, max: 29 },
  ph: { min: 7.8, max: 8.5 },
  turb: { min: 0, max: 5 },
};

// Cada variable con sus ids en el HTML y cuántos decimales mostrar
const VARIABLES = {
  temp: { valor: "valorTemp", cambio: "cambioTemp", chip: "chipTemp", prom: "promTemp", min: "minTemp", max: "maxTemp", decimales: 1 },
  ph: { valor: "valorPh", cambio: "cambioPh", chip: "chipPh", prom: "promPh", min: "minPh", max: "maxPh", decimales: 2 },
  turb: { valor: "valorTurb", cambio: "cambioTurb", chip: "chipTurb", prom: "promTurb", min: "minTurb", max: "maxTurb", decimales: 1 },
};

// crearGrafica: crea una gráfica de línea vacía en el <canvas> indicado y la devuelve
function crearGrafica(idCanvas, nombre, color) {
  return new Chart(document.getElementById(idCanvas), {
    type: "line",
    data: {
      labels: [],                        // eje X (días); se llena después
      datasets: [{
        label: nombre,
        data: [],                        // eje Y (promedio de cada día); se llena después
        borderColor: color,
        backgroundColor: color + "33",   // el mismo color pero transparente (relleno)
        fill: true,
        tension: 0.3,                    // línea un poco curva
        pointRadius: 3,
        spanGaps: true,                  // si un día no tiene datos, une los puntos de al lado
      }],
    },
    options: {
      aspectRatio: 2,                    // el doble de ancha que de alta
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#a7c4cf", maxTicksLimit: 8 }, grid: { color: "#1f5266" } },
        y: { ticks: { color: "#a7c4cf" }, grid: { color: "#1f5266" } },
      },
    },
  });
}

// Las 3 gráficas se crean una sola vez y luego solo se les cambian los datos
const graficas = {
  temp: crearGrafica("graficaTemp", "Temperatura (°C)", "#ff6b6b"),
  ph: crearGrafica("graficaPh", "pH", "#6cc5c9"),
  turb: crearGrafica("graficaTurb", "Turbidez (NTU)", "#7cc8a0"),
};

// actualizarInicio: arma los días del periodo, saca el promedio de cada día
// y actualiza gráficas, tarjetas, mínimo/máximo y estado
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
  const etiquetas = dias.map((clave) => clave.slice(8, 10) + "/" + clave.slice(5, 7));

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

    ponerEstado(v.chip, ultimo[nombre], RANGOS[nombre]);
  }
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
function ponerEstado(idChip, valor, rango) {
  const chip = document.getElementById(idChip);
  if (isNaN(valor)) {
    chip.textContent = "";
    chip.className = "chip";
    return;
  }
  const normal = valor >= rango.min && valor <= rango.max;
  chip.textContent = normal ? "Normal" : "Fuera de rango";
  chip.className = "chip " + (normal ? "bien" : "alerta");   // el CSS les da color verde o rojo
}

// cambiarPeriodo: los botones Semana / Mes
function cambiarPeriodo(dias) {
  diasPeriodo = dias;
  document.getElementById("btnSemana").classList.toggle("activa", dias === 7);
  document.getElementById("btnMes").classList.toggle("activa", dias === 30);
  actualizarInicio();
}

document.getElementById("btnSemana").addEventListener("click", () => cambiarPeriodo(7));
document.getElementById("btnMes").addEventListener("click", () => cambiarPeriodo(30));


// ============================================================
// 8) CONSULTAS: TODAS LAS LECTURAS DE UN DÍA
// Muestra la hora exacta (timestamp) en que la Raspberry tomó cada dato
// ============================================================
function consultarDia(evento) {
  evento.preventDefault();
  const caja = document.getElementById("cajaTabla");
  const cuerpo = document.getElementById("cuerpoTabla");

  if (!idActual) {
    caja.hidden = true;
    return mostrarMensaje("msgConsulta", "Primero escribe el ID del dispositivo en Inicio.");
  }

  const dia = document.getElementById("fechaConsulta").value;   // viene como AAAA-MM-DD
  const delDia = todosLosDatos.filter((d) => claveDia(d.hora) === dia);

  if (delDia.length === 0) {
    caja.hidden = true;
    return mostrarMensaje("msgConsulta", "No hay lecturas de " + idActual + " ese día.");
  }

  mostrarMensaje("msgConsulta", delDia.length + " lecturas de " + idActual + " ese día.", "#7cc8a0");

  // Una fila por lectura; la más nueva arriba
  cuerpo.innerHTML = "";
  [...delDia].reverse().forEach((d) => {
    const fila = document.createElement("tr");
    [horaCompleta(d.hora), d.temp, d.ph, d.turb].forEach((dato, i) => {
      const celda = document.createElement("td");
      if (i === 0) celda.textContent = dato;
      else celda.textContent = isNaN(dato) ? "--" : dato.toFixed(i === 2 ? 2 : 1);
      fila.appendChild(celda);
    });
    cuerpo.appendChild(fila);
  });
  caja.hidden = false;
}

document.getElementById("formConsulta").addEventListener("submit", consultarDia);


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
