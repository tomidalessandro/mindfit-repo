/* El coach da de alta a un alumno.
 *
 *   npm run web            (en otra terminal)
 *   node tests/e2e/alta-alumno.mjs
 *
 * Lo que más importa acá no es que funcione, sino que NO funcione para quien
 * no corresponde: la ruta usa la clave secreta, así que si autorizara mal,
 * cualquier alumno logueado podría crear usuarios.
 *
 * Borra al alumno que crea al terminar.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const APP = process.env.APP_URL ?? "http://localhost:3000";
const COACH = process.env.EMAIL_COACH ?? "e2e-coach@mindfit.local";
const ALUMNO = process.env.EMAIL_ALUMNO ?? "e2e-alumno@mindfit.local";
const CLAVE = "prueba-e2e-no-usar-" + process.pid;
const NOMBRE = "Alta " + process.pid;

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split("\n")
    .map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const [k, ...v] = l.split("="); return [k.trim(), v.join("=").trim().replace(/^["']|["']$/g, "")]; }),
);
const API = env.SUPABASE_URL.replace(/\/$/, "");
const cab = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, "Content-Type": "application/json" };

async function usuario(email) {
  const r = await fetch(`${API}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, { headers: cab });
  return (await r.json()).users.find((x) => (x.email ?? "").toLowerCase() === email);
}
async function ponerClave(email) {
  const u = await usuario(email);
  if (!u) throw new Error(`no existe ${email}. Corré: npm run test:cuentas`);
  await fetch(`${API}/auth/v1/admin/users/${u.id}`, { method: "PUT", headers: cab, body: JSON.stringify({ password: CLAVE }) });
  return u.id;
}

const fallos = [];
const ok = (c, q) => { console.log((c ? "  ✓ " : "  ✗ ") + q); if (!c) fallos.push(q); };

const idCoach = await ponerClave(COACH);
await ponerClave(ALUMNO);

async function entrar(pg, email) {
  await pg.goto(`${APP}/entrar`, { waitUntil: "domcontentloaded" });
  await pg.getByLabel("Tu mail").fill(email);
  await pg.getByLabel("Tu contraseña").fill(CLAVE);
  await pg.getByRole("button", { name: "Entrar" }).click();
  await pg.waitForURL((x) => !String(x).includes("/entrar"), { timeout: 25000 });
  await pg.waitForLoadState("networkidle");
}

const nav = await chromium.launch();
let creado = null;

try {
  console.log("── sin sesión ──");
  const anon = await (await nav.newContext()).newPage();
  const r0 = await anon.request.post(`${APP}/api/alumnos`, { data: { nombre: "Intruso" } });
  ok(r0.status() === 401, `sin sesión da 401 (dio ${r0.status()})`);

  console.log("\n── como alumno ──");
  const ctxA = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pgA = await ctxA.newPage();
  await entrar(pgA, ALUMNO);
  ok((await pgA.getByRole("button", { name: "+ Nuevo alumno" }).count()) === 0,
     "el alumno no ve el botón");
  const r1 = await pgA.request.post(`${APP}/api/alumnos`, { data: { nombre: "Intruso" } });
  ok(r1.status() === 403, `y pidiéndolo a mano da 403 (dio ${r1.status()})`);

  console.log("\n── como coach ──");
  const ctxC = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pgC = await ctxC.newPage();
  await entrar(pgC, COACH);

  await pgC.getByRole("button", { name: "+ Nuevo alumno" }).click();
  await pgC.getByLabel("Nombre del alumno").fill(NOMBRE);
  await pgC.getByRole("button", { name: "Crear" }).click();
  await pgC.getByText("ya puede entrar").waitFor({ timeout: 25000 });

  const tarjeta = await pgC.locator("body").innerText();
  ok(/@mindfit\.local/.test(tarjeta), "muestra el usuario que le armó");
  ok(/[a-z]+-[a-z]+-[a-z]+-\d\d/.test(tarjeta), "muestra la contraseña");

  const clave = tarjeta.match(/[a-z]+-[a-z]+-[a-z]+-\d\d/)[0];
  const email = tarjeta.match(/[a-z0-9]+@mindfit\.local/)[0];
  creado = await usuario(email);

  console.log("\n── el alumno nuevo entra de verdad ──");
  const ctxN = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pgN = await ctxN.newPage();
  await pgN.goto(`${APP}/entrar`, { waitUntil: "domcontentloaded" });
  await pgN.getByLabel("Tu mail").fill(email);
  await pgN.getByLabel("Tu contraseña").fill(clave);
  await pgN.getByRole("button", { name: "Entrar" }).click();
  await pgN.waitForURL((x) => !String(x).includes("/entrar"), { timeout: 25000 });
  await pgN.waitForLoadState("networkidle");
  const suyo = await pgN.locator("body").innerText();
  ok(suyo.includes("Tus rutinas"), "entra con la contraseña que le dieron");
  ok(suyo.includes(NOMBRE), "y la app lo saluda por su nombre");

  console.log("\n── queda colgado del coach que lo creó ──");
  await pgC.reload({ waitUntil: "domcontentloaded" });
  await pgC.waitForLoadState("networkidle");
  ok((await pgC.locator("body").innerText()).includes(NOMBRE),
     "aparece en la lista del coach");

  const perfil = await (await fetch(
    `${API}/rest/v1/perfiles?select=coach_id,rol&id=eq.${creado.id}`, { headers: cab })).json();
  ok(perfil[0]?.coach_id === idCoach, "con el coach_id correcto en la base");
  ok(perfil[0]?.rol === "alumno", "y como alumno, no como coach");
} finally {
  await nav.close();
  if (creado) {
    await fetch(`${API}/auth/v1/admin/users/${creado.id}`, { method: "DELETE", headers: cab });
  }
}

console.log("\n" + (fallos.length ? `❌ ${fallos.length} fallos` : "✅ todo bien"));
process.exit(fallos.length ? 1 : 0);
