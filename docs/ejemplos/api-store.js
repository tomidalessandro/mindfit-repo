// ============================================================================
// EJEMPLO — Etapa 2: el backend propio
// ----------------------------------------------------------------------------
// ⚠️ Este archivo NO está activo. Vive en docs/ejemplos/ justamente para que
// Vercel no lo publique. Cuando lo quieras usar de verdad, se mueve a
// /api/store.js en la raíz del repo y ahí sí pasa a ser una función.
//
// QUÉ PROBLEMA RESUELVE
//
// Hoy el navegador del alumno tiene la clave de Supabase adentro del HTML.
// Esa clave, con la política actual, abre toda la base. Cualquiera que abra
// la app puede leer o borrar los datos de todos.
//
// La idea acá es simple: el navegador deja de hablar con Supabase. Habla con
// esta función, que corre en el servidor de Vercel. La clave secreta vive
// como variable de entorno del proyecto, nunca viaja al celular, y la
// función decide qué puede tocar cada uno.
//
//   ANTES:   celular  ──── clave que abre todo ────►  Supabase
//   DESPUÉS: celular  ──── token del alumno ────►  /api/store  ──► Supabase
//                                                  (con la clave secreta)
//
// VARIABLES DE ENTORNO A CARGAR EN VERCEL
// (Project Settings → Environment Variables; nunca en el repo)
//
//   SUPABASE_URL          https://xxxx.supabase.co
//   SUPABASE_SECRET_KEY   sb_secret_...   ← la que NUNCA va al navegador
//   MINDFIT_COACH_PIN     la clave del modo coach
//   MINDFIT_TOKEN_SECRET  una frase larga al azar, para firmar los tokens
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } }
);

/* --------------------------------------------------------------------------
   Token del alumno
   El link deja de ser  .../#karina  (que se adivina escribiendo un nombre)
   y pasa a ser         .../?t=karina.9f2c1a...
   donde la segunda parte es una firma que solo el servidor sabe generar.
   Sin el token correcto, la función no devuelve nada.
   -------------------------------------------------------------------------- */
function firmar(alumnoId) {
  return crypto
    .createHmac('sha256', process.env.MINDFIT_TOKEN_SECRET)
    .update(alumnoId)
    .digest('base64url')
    .slice(0, 24);
}

function alumnoDelToken(token) {
  if (!token) return null;
  const corte = token.lastIndexOf('.');
  if (corte < 1) return null;
  const id = token.slice(0, corte);
  const firma = token.slice(corte + 1);
  // Comparación en tiempo constante: evita que se pueda adivinar la firma
  // midiendo cuánto tarda en fallar.
  const esperada = firmar(id);
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length) return null;
  return crypto.timingSafeEqual(a, b) ? id : null;
}

/* --------------------------------------------------------------------------
   Qué claves puede tocar cada uno.
   El coach, todas. El alumno, solo las suyas: su índice, sus planes y sus
   pesos. La biblioteca de ejercicios la lee, pero no la escribe.
   -------------------------------------------------------------------------- */
async function puedeTocar(clave, quien, escritura) {
  if (quien.rol === 'coach') return true;

  if (clave === 'biblioteca' || clave === 'alumnos' || clave === 'indice') {
    return !escritura;                       // los alumnos solo leen
  }
  const [tipo, id] = clave.split(':');
  if (tipo !== 'plan' && tipo !== 'cargas') return false;

  // El plan tiene que ser de este alumno. Lo verificamos contra la base,
  // nunca contra lo que dice el navegador.
  const { data } = await supa
    .from('mindfit_store').select('valor').eq('clave', 'plan:' + id).single();
  return data?.valor?.alumnoId === quien.id;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo POST' });
  }

  const { accion, clave, valor, token, pin } = req.body || {};

  // ---- quién está pidiendo ----
  let quien = null;
  if (pin && pin === process.env.MINDFIT_COACH_PIN) {
    quien = { rol: 'coach', id: null };
  } else {
    const alumnoId = alumnoDelToken(token);
    if (!alumnoId) return res.status(401).json({ error: 'Token inválido' });
    quien = { rol: 'alumno', id: alumnoId };
  }

  if (typeof clave !== 'string' || clave.length > 120) {
    return res.status(400).json({ error: 'Clave inválida' });
  }
  if (!(await puedeTocar(clave, quien, accion === 'set'))) {
    return res.status(403).json({ error: 'Sin permiso para esa clave' });
  }

  // ---- hacer la operación ----
  if (accion === 'get') {
    const { data, error } = await supa
      .from('mindfit_store').select('valor').eq('clave', clave).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, valor: data?.valor ?? null });
  }

  if (accion === 'set') {
    const { error } = await supa
      .from('mindfit_store')
      .upsert({ clave, valor }, { onConflict: 'clave' });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Acción desconocida' });
}

// ============================================================================
// DEL LADO DE LA APP
// ----------------------------------------------------------------------------
// El cambio es chico, y ese es el punto: la app ya tiene la capa `store` con
// cuatro backends que cumplen la misma interfaz (read / write / watch). Se
// agrega un quinto y listo. No hay que tocar ni una pantalla.
//
//   const Api2 = {
//     async read(k){
//       const r = await fetch("/api/store", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ accion:"get", clave:k, token:TOKEN, pin:PIN })
//       });
//       const j = await r.json();
//       return j.ok ? j.valor : null;
//     },
//     async write(k, v){
//       await Local.write(k, v);                       // copia local, como hoy
//       await fetch("/api/store", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ accion:"set", clave:k, valor:v, token:TOKEN, pin:PIN })
//       });
//     },
//     watch(k, cb){
//       const t = setInterval(async () => { const v = await Api2.read(k); if (v) cb(v); }, 20000);
//       return () => clearInterval(t);
//     }
//   };
//
// Y en elegirBackend(), antes de la opción Supabase directa:
//
//   if (location.hostname.endsWith("vercel.app") || CFG.usarApiPropia){
//     store = Api2; backend = "nube"; return;
//   }
// ============================================================================
