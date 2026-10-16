// ============================================================
// app.js — Lógica de index.html
//   1) Iniciar sesión (usuarios que ya tienen cuenta)
//   2) Crear cuenta (usuarios nuevos)
//   3) Restablecer contraseña (envía un correo)
// ============================================================


// ---------- CARGAR FIREBASE ----------
// Estas líneas traen las funciones de Firebase desde internet
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,      // revisar correo y contraseña
  createUserWithEmailAndPassword,  // crear cuenta nueva
  sendPasswordResetEmail,          // enviar correo para restablecer
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";


// ---------- DATOS DE TU PROYECTO ----------
const firebaseConfig = {
  apiKey: "AIzaSyCap_W0d4Tq7CIq9KHL-SjW1cYFK_9FeNY",
  authDomain: "coralis-2ddd8.firebaseapp.com",
  databaseURL: "https://coralis-2ddd8-default-rtdb.firebaseio.com",
  projectId: "coralis-2ddd8",
  appId: "1:741966519586:web:8a94322c2b0086c36f197b",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);       // maneja usuarios y contraseñas
const db = getDatabase(app);     // la base de datos (carpeta "usuarios")
auth.languageCode = "es";        // los correos llegan en español

const PAGINA_PRINCIPAL = "coralis_principal.html";


// ---------- FUNCIONES DE AYUDA ----------
function mostrarMensaje(id, texto, color = "#ff8a8a") {
  document.getElementById(id).textContent = texto;
  document.getElementById(id).style.color = color;
}

// Revisa las reglas de la contraseña. Devuelve el problema, o "" si está bien
function revisarClave(clave) {
  if (clave.length < 8) return "La contraseña debe tener mínimo 8 caracteres";
  if (!/[0-9]/.test(clave)) return "La contraseña debe tener al menos un número";
  if (!/[^A-Za-z0-9]/.test(clave)) return "La contraseña debe tener un carácter especial (!@#$%...)";
  return "";
}

// Firebase responde con códigos en inglés; aquí los traducimos
function traducirError(error) {
  const errores = {
    "auth/invalid-credential": "Correo o contraseña incorrectos",
    "auth/invalid-email": "El correo no es válido",
    "auth/missing-email": "Escribe tu correo",
    "auth/missing-password": "Escribe la contraseña",
    "auth/email-already-in-use": "Ya existe una cuenta con ese correo",
    "auth/weak-password": "La contraseña es demasiado débil",
    "auth/too-many-requests": "Demasiados intentos, espera un momento",
  };
  return errores[error.code] || "Error: " + error.message;
}


// ============================================================
// 1) INICIAR SESIÓN — usuarios que ya tienen cuenta
// ============================================================
async function entrar(evento) {
  evento.preventDefault();   // evita que el formulario recargue la página

  const correo = document.getElementById("correo").value.trim();
  const clave = document.getElementById("clave").value;

  try {
    await signInWithEmailAndPassword(auth, correo, clave);
    window.location.href = PAGINA_PRINCIPAL;
  } catch (error) {
    mostrarMensaje("msgLogin", traducirError(error));
  }
}


// ============================================================
// 2) CREAR CUENTA — usuarios nuevos
// ============================================================
async function crearCuenta() {
  const correo = document.getElementById("correoNuevo").value.trim();
  const clave = document.getElementById("claveNueva").value;
  const claveRepetida = document.getElementById("claveRepetida").value;

  // Revisamos antes de enviar nada
  const problema = revisarClave(clave);
  if (problema) return mostrarMensaje("msgCuenta", problema);
  if (clave !== claveRepetida) return mostrarMensaje("msgCuenta", "Las contraseñas no coinciden");

  try {
    // Firebase crea la cuenta (la contraseña se guarda cifrada en Authentication)
    const resultado = await createUserWithEmailAndPassword(auth, correo, clave);

    // Guardamos la ficha del usuario en la carpeta "usuarios" (sin contraseña)
    const datos = {
      correo: correo,
      creado: new Date().toISOString(),
    };
    await set(ref(db, "usuarios/" + resultado.user.uid), datos);

    window.location.href = PAGINA_PRINCIPAL;
  } catch (error) {
    mostrarMensaje("msgCuenta", traducirError(error));
  }
}


// ============================================================
// 3) RESTABLECER CONTRASEÑA — envía un correo con un enlace
// ============================================================
async function restablecer() {
  const correo = document.getElementById("correoOlvide").value.trim();
  if (!correo) return mostrarMensaje("msgOlvide", "Escribe tu correo");

  try {
    await sendPasswordResetEmail(auth, correo);
    mostrarMensaje("msgOlvide", "Si ese correo tiene cuenta, te llegará un enlace. Revisa también spam.", "#7cc8a0");
  } catch (error) {
    mostrarMensaje("msgOlvide", traducirError(error));
  }
}


// ============================================================
// ABRIR Y CERRAR LAS VENTANAS EMERGENTES
// ============================================================
function abrirPopup(id) {
  const popup = document.getElementById(id);
  popup.hidden = false;
  popup.classList.add("abierto");
}

function cerrarPopup(id) {
  const popup = document.getElementById(id);
  popup.classList.remove("abierto");
  popup.querySelectorAll("input").forEach((campo) => (campo.value = ""));
  popup.querySelector(".mensaje").textContent = "";
}


// ============================================================
// CONECTAR CADA BOTÓN CON SU FUNCIÓN
// (con type="module" no funciona onclick="..." en el HTML, por eso se hace aquí)
// ============================================================
document.getElementById("Login").addEventListener("submit", entrar);

document.getElementById("botonCuenta").addEventListener("click", () => abrirPopup("popupCuenta"));
document.getElementById("botonEnviarCuenta").addEventListener("click", crearCuenta);
document.getElementById("botonCerrarCuenta").addEventListener("click", () => cerrarPopup("popupCuenta"));

document.getElementById("botonOlvide").addEventListener("click", () => abrirPopup("popupOlvide"));
document.getElementById("botonEnviarOlvide").addEventListener("click", restablecer);
document.getElementById("botonCerrarOlvide").addEventListener("click", () => cerrarPopup("popupOlvide"));

// BOTÓN DE OJITO PARA VER LA CONTRASEÑA
// Busca todos los campos de contraseña y les pone un botón 👁️ a la derecha
// ============================================================
document.querySelectorAll('input[type="password"]').forEach((campo) => {
  
// Envolvemos el campo en una caja para poder poner el botón encima
  
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
    
campo.type = oculta ? "text" : "password";     // text = se ve, password = puntitos
    
ojo.textContent = oculta ? "🙈" : "👁️";
    
ojo.title = oculta ? "Ocultar contraseña" : "Mostrar contraseña";
  
});
});
