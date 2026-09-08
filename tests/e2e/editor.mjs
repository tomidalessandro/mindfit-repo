/* El coach arma una rutina de cero.
 *
 *   npm run web            (en otra terminal)
 *   node tests/e2e/editor.mjs
 *
 * Recorre lo que Tomás va a hacer cada mes: crear el mesociclo, cargarle
 * ejercicios, y que el alumno lo vea. Limpia lo que crea al terminar.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const APP = process.env.APP_URL ?? "http://localhost:3000";
// Las cuentas de prueba, nunca las de personas reales: esta suite le cambia
// la contraseña a quien use para poder entrar, y hacérselo a Tomás o a una
// alumna los deja afuera sin que nadie se entere. Se arman con:
//   cd apps/worker && uv run python -m mindfit_worker.usuarios --prueba
const COACH = process.env.EMAIL_COACH ?? "e2e-coach@mindfit.local";
const ALUMNO = process.env.EMAIL_ALUMNO ?? "e2e-alumno@mindfit.local";
const CLAVE = "prueba-e2e-no-usar-" + process.pid;
const TITULO = "Prueba automática " + process.pid;

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
  await fetch(`${API}/auth/v1/admin/users/${u.id}`, { method: "PUT", headers: cab, body: JSON.stringify({ password: CLAVE }) });
  return u.id;
}

const fallos = [];
const ok = (c, q) => { console.log((c ? "  ✓ " : "  ✗ ") + q); if (!c) fallos.push(q); };

await ponerClave(COACH);

// Siempre la cuenta de prueba, nunca "un alumno cualquiera": esta prueba le
// cambia la contraseña a quien use, y hacérselo a una alumna de verdad la
// dejaría afuera sin que nadie se entere.
const uPrueba = await usuario(ALUMNO);
if (!uPrueba) throw new Error(
  `no existe ${ALUMNO}. Corré: cd apps/worker && uv run python -m mindfit_worker.usuarios --prueba`);
const alumno = { id: uPrueba.id, nombre: "prueba" };

const nav = await chromium.launch();
const pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
pg.on("pageerror", (e) => fallos.push("error de JS: " + String(e).slice(0, 120)));

try {
  await pg.goto(`${APP}/entrar`, { waitUntil: "domcontentloaded" });
  await pg.getByLabel("Tu mail").fill(COACH);
  await pg.getByLabel("Tu contraseña").fill(CLAVE);
  await pg.getByRole("button", { name: "Entrar" }).click();
  await pg.waitForURL((x) => !String(x).includes("/entrar"), { timeout: 25000 });

  console.log("── crear un mesociclo ──");
  await pg.goto(`${APP}/alumno/${alumno.id}`, { waitUntil: "domcontentloaded" });
  await pg.waitForLoadState("networkidle");
  await pg.getByRole("button", { name: "+ Nuevo mesociclo" }).click();
  await pg.getByLabel("Título").fill(TITULO);
  await pg.getByLabel("Días por semana").selectOption("2");
  await pg.getByRole("button", { name: "Crear" }).click();
  await pg.waitForURL(/\/plan\//, { timeout: 25000 });
  await pg.waitForLoadState("networkidle");
  ok(/\/plan\//.test(pg.url()), "lleva derecho al plan nuevo");

  const cuerpo = await pg.locator("body").innerText();
  ok(cuerpo.includes("Día 1") && cuerpo.includes("Día 2"), "creó los 2 días pedidos");
  ok(cuerpo.includes("S4"), "creó las 4 semanas");

  console.log("\n── cargar un ejercicio ──");
  await pg.getByRole("button", { name: "Editar" }).click();
  await pg.getByRole("button", { name: "+ Ejercicio" }).last().click();
  await pg.waitForTimeout(300);

  // Se elige de la lista, no se escribe: escribirlo a mano deja solo el
  // nombre, y lo que interesa probar es que al elegirlo se traiga el resto.
  const nombre = pg.getByRole("combobox").first();
  await nombre.click();
  await nombre.fill("Sentadilla");
  await pg.waitForTimeout(400);
  await pg.getByRole("listbox").first().getByRole("option").first().click();
  await pg.waitForTimeout(1400);
  const video = pg.locator('input[inputmode="url"]').first();
  ok((await video.inputValue()).includes("youtube"),
     "al elegir de la biblioteca se trae el video");

  console.log("\n── el alumno lo ve ──");
  await pg.getByRole("button", { name: "Listo" }).click();
  await pg.waitForTimeout(500);
  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.waitForLoadState("networkidle");
  ok((await pg.locator("body").innerText()).includes("Sentadilla"),
     "el ejercicio sobrevivió a la recarga");

  console.log("\n── el alumno no puede editar ──");
  const url = pg.url();
  const uAlumno = (await (await fetch(`${API}/auth/v1/admin/users?page=1&per_page=200`, { headers: cab })).json())
    .users.find((u) => u.id === alumno.id);
  await ponerClave(uAlumno.email.toLowerCase());

  // Un contexto nuevo y no el mismo: /entrar rebota a quien ya tiene sesión,
  // así que reutilizarlo dejaba la prueba esperando un formulario que la app
  // —con razón— no le iba a mostrar nunca.
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pgAlumno = await ctx.newPage();
  await pgAlumno.goto(`${APP}/entrar`, { waitUntil: "domcontentloaded" });
  await pgAlumno.getByLabel("Tu mail").fill(uAlumno.email);
  await pgAlumno.getByLabel("Tu contraseña").fill(CLAVE);
  await pgAlumno.getByRole("button", { name: "Entrar" }).click();
  await pgAlumno.waitForURL((x) => !String(x).includes("/entrar"), { timeout: 25000 });

  await pgAlumno.goto(url, { waitUntil: "domcontentloaded" });
  await pgAlumno.waitForLoadState("networkidle");
  ok((await pgAlumno.getByRole("button", { name: "Editar" }).count()) === 0,
     "el alumno no ve el botón de editar");
  ok((await pgAlumno.locator("body").innerText()).includes("Sentadilla"),
     "pero sí ve la rutina que le armaron");

} finally {
  await nav.close();
  // Se lleva lo que creó: las pruebas no dejan basura en la base.
  await fetch(`${API}/rest/v1/planes?titulo=eq.${encodeURIComponent(TITULO)}`,
              { method: "DELETE", headers: cab });
}

console.log("\n" + (fallos.length ? `❌ ${fallos.length} fallos` : "✅ todo bien"));
process.exit(fallos.length ? 1 : 0);
