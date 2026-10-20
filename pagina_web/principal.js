// ============================================================
// coralis_principal.js — Lógica de la página principal
//   1) Revisar que haya sesión iniciada
//   2) Cambiar entre Inicio y Consultas
//   3) Cerrar sesión
//   4) Mi cuenta: ver el correo y cambiar la contraseña
//   (las gráficas y las fotos las haremos después)
// ============================================================


// ---------- CARGAR FIREBASE ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  EmailAuthProvider,              // para volver a revisar la contraseña actual
  reauthenticateWithCredential,
  updatePassword,                 // cambiar la contraseña
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
const db = getDatabase(app);


// ---------- DATOS DE TU PROYECTO (los mismos del login) ----------
const firebaseConfig = {
  apiKey: "AIzaSyCap_W0d4Tq7CIq9KHL-SjW1cYFK_9FeNY",
  authDomain: "coralis-2ddd8.firebaseapp.com",
  databaseURL: "https://coralis-2ddd8-default-rtdb.firebaseio.com",
  projectId: "coralis-2ddd8",
  appId: "1:741966519586:web:8a94322c2b0086c36f197b",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Página del login (cámbiala si tu archivo se llama distinto)
const PAGINA_LOGIN = "coralis_pag.html";


// ============================================================
// 1) REVISAR QUE HAYA SESIÓN
// Si alguien abre esta página sin iniciar sesión, lo mandamos al login
// ============================================================
let escuchando = false; // evita crear la lectura más de una vez

onAuthStateChanged(auth, (usuario) => {
  if (usuario) {
    document.getElementById("correoUsuario").textContent = usuario.email;
    document.getElementById("correoCuenta").textContent = usuario.email;
    if (!escuchando) {
      escuchando = true;
      escucharLecturas();
    }
  } else {
    window.location.replace(PAGINA_LOGIN);
  }
});


// ============================================================
// 2) CAMBIAR ENTRE SECCIONES (Inicio / Consultas)
// ============================================================
// Cada sección con su botón del menú
const SECCIONES = {
  inicio: "btnInicio",
  consultas: "btnConsultas",
  cuenta: "btnCuenta",
};

function mostrarSeccion(elegida) {
  for (const seccion in SECCIONES) {
    // Se ve solo la sección elegida, las demás se ocultan
    document.getElementById(seccion).hidden = seccion !== elegida;
    // Marcamos el botón de la sección que se está viendo
    document.getElementById(SECCIONES[seccion]).classList.toggle("activa", seccion === elegida);
  }
}

document.getElementById("btnInicio").addEventListener("click", () => mostrarSeccion("inicio"));
document.getElementById("btnConsultas").addEventListener("click", () => mostrarSeccion("consultas"));
document.getElementById("btnCuenta").addEventListener("click", () => mostrarSeccion("cuenta"));


// ============================================================
// 3) CERRAR SESIÓN
// ============================================================
document.getElementById("btnSalir").addEventListener("click", async () => {
  if (confirm("¿Seguro que quieres cerrar sesión?")) {
    await signOut(auth);
    window.location.replace(PAGINA_LOGIN);
  }
});


// ============================================================
// 4) MI CUENTA: CAMBIAR LA CONTRASEÑA
// ============================================================
function mostrarMensaje(texto, color = "#ff8a8a") {
  document.getElementById("msgCuenta").textContent = texto;
  document.getElementById("msgCuenta").style.color = color;
}

// Las mismas reglas que al crear la cuenta
function revisarClave(clave) {
  if (clave.length < 8) return "La contraseña debe tener mínimo 8 caracteres";
  if (!/[0-9]/.test(clave)) return "La contraseña debe tener al menos un número";
  if (!/[^A-Za-z0-9]/.test(clave)) return "La contraseña debe tener un carácter especial (!@#$%...)";
  return "";
}

async function cambiarClave() {
  const actual = document.getElementById("claveActual").value;
  const nueva = document.getElementById("claveNueva").value;
  const repetida = document.getElementById("claveRepetida").value;

  if (!actual) return mostrarMensaje("Escribe tu contraseña actual");
  const problema = revisarClave(nueva);
  if (problema) return mostrarMensaje(problema);
  if (nueva !== repetida) return mostrarMensaje("Las contraseñas nuevas no coinciden");

  try {
    // Por seguridad, Firebase pide confirmar la contraseña actual antes de cambiarla
    const usuario = auth.currentUser;
    const credencial = EmailAuthProvider.credential(usuario.email, actual);
    await reauthenticateWithCredential(usuario, credencial);

    await updatePassword(usuario, nueva);

    mostrarMensaje("Contraseña cambiada correctamente", "#7cc8a0");
    document.querySelectorAll("#cuenta input").forEach((campo) => (campo.value = ""));
  } catch (error) {
    if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
      mostrarMensaje("La contraseña actual no es correcta");
    } else if (error.code === "auth/too-many-requests") {
      mostrarMensaje("Demasiados intentos, espera un momento");
    } else {
      mostrarMensaje("Error: " + error.message);
    }
  }
}

document.getElementById("btnCambiarClave").addEventListener("click", cambiarClave);
// ============================================================
// 5) LECTURAS EN TIEMPO REAL (vienen de Firebase, escritas por el puente)
// ============================================================
function escucharLecturas() {
  const ultima = ref(db, "lecturas/coralis-device/ultima");

  onValue(
    ultima,
    (snap) => {
      const d = snap.val();
      if (!d) return; // todavía no hay datos

      document.getElementById("valorPh").textContent = Number(d.ph).toFixed(2);
      document.getElementById("valorTemp").textContent = Number(d.temperatura).toFixed(1);
      document.getElementById("valorTurb").textContent = Number(d.turbidez).toFixed(0);
      document.getElementById("horaLectura").textContent = new Date(d.timestamp).toLocaleString(
        "es-CO",
        { timeZone: "America/Bogota" }
      );
    },
    (error) => {
      console.error("No se pudo leer Firebase:", error.code);
    }
  );
}



// ============================================================
// VENTANA DE LA FOTO EN GRANDE: botón Cerrar
// ============================================================
document.getElementById("btnCerrarFoto").addEventListener("click", () => {
  const popup = document.getElementById("popupFoto");
  popup.classList.remove("abierto");
  popup.hidden = true;
});


// ============================================================
// BOTÓN DE OJITO PARA VER LA CONTRASEÑA (igual que en el login)
// ============================================================
document.querySelectorAll('input[type="password"]').forEach((campo) => {
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
