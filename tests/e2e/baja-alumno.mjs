/* Dar de baja a un alumno y volver a darle el alta.
 *
 *   npm run web            (en otra terminal)
 *   node tests/e2e/baja-alumno.mjs
 *
 * Lo que se prueba de verdad: que la baja NO borre nada. El alumno sale de la
 * lista y no puede entrar, pero sus mesociclos y sus pesos siguen en la base
 * y vuelven enteros al reactivarlo.
 *
 * Trabaja sobre un alumno que crea y borra al terminar, para no tocar a nadie.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const APP = process.env.APP_URL ?? "http://localhost:3000";
const COACH = process.env.EMAIL_COACH ?? "e2e-coach@mindfit.local";
const CLAVE = "prueba-e2e-no-usar-" + process.pid;
const NOMBRE = "Baja " + process.pid;

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

const fallos = [];
const ok = (c, q) => { console.log((c ? "  ✓ " : "  ✗ ") + q); if (!c) fallos.push(q); };

const uCoach = await usuario(COACH);
if (!uCoach) throw new Error("no existen las cuentas de prueba. Corré: npm run test:cuentas");
await fetch(`${API}/auth/v1/admin/users/${uCoach.id}`, { method: "PUT", headers: cab, body: JSON.stringify({ password: CLAVE }) });

const nav = await chromium.launch();
let creado = null;

try {
  const pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
  pg.on("pageerror", (e) => fallos.push("error de JS: " + String(e).slice(0, 120)));

  await pg.goto(`${APP}/entrar`, { waitUntil: "domcontentloaded" });
  await pg.getByLabel("Tu mail").fill(COACH);
  await pg.getByLabel("Tu contraseña").fill(CLAVE);
  await pg.getByRole("button", { name: "Entrar" }).click();
  await pg.waitForURL((x) => !String(x).includes("/entrar"), { timeout: 25000 });

  console.log("── preparar: un alumno con datos ──");
  await pg.getByRole("button", { name: "+ Nuevo alumno" }).click();
  await pg.getByLabel("Nombre del alumno").fill(NOMBRE);
  await pg.getByRole("button", { name: "Crear" }).click();
  await pg.getByText("ya puede entrar").waitFor({ timeout: 25000 });
  const tarjeta = await pg.locator("body").innerText();
  const email = tarjeta.match(/[a-z0-9]+@mindfit\.local/)[0];
  const claveAlumno = tarjeta.match(/[a-z]+-[a-z]+-[a-z]+-\d\d/)[0];
  creado = await usuario(email);

  // Un mesociclo y unos pesos, para tener algo que se pueda perder.
  const plan = await (await fetch(`${API}/rest/v1/planes`, {
    method: "POST", headers: { ...cab, Prefer: "return=representation" },
    body: JSON.stringify({
      alumno_id: creado.id, coach_id: uCoach.id, titulo: "Para la baja",
      semanas: 4, estructura: [{ nombre: "Día 1", num: "01", bloques: [
        { titulo: "Fuerza", ejercicios: [{ nombre: "Sentadilla", reps: ["8x3","8x3","8x3","8x3"] }] }] }],
    }),
  })).json();
  await fetch(`${API}/rest/v1/registros`, {
    method: "POST", headers: cab,
    body: JSON.stringify([
      { plan_id: plan[0].id, alumno_id: creado.id, dia: 0, bloque: 0, ejercicio: 0, semana: 0, serie: 1, carga: "60" },
      { plan_id: plan[0].id, alumno_id: creado.id, dia: 0, bloque: 0, ejercicio: 0, semana: 0, serie: 2, carga: "62" },
    ]),
  });
  console.log(`  ${NOMBRE}: 1 mesociclo, 2 series`);

  console.log("\n── darlo de baja ──");
  await pg.goto(`${APP}/alumno/${creado.id}`, { waitUntil: "domcontentloaded" });
  await pg.waitForLoadState("networkidle");
  await pg.getByRole("button", { name: `Dar de baja a ${NOMBRE}` }).click();
  await pg.getByRole("button", { name: "Sí, dar de baja" }).click();
  await pg.getByText("está dado de baja").waitFor({ timeout: 20000 });
  ok(true, "queda marcado como dado de baja");

  await pg.goto(`${APP}/`, { waitUntil: "domcontentloaded" });
  await pg.waitForLoadState("networkidle");

  // Por el DOM y no por posiciones dentro del texto: el alumno de prueba se
  // llama "Baja <pid>", así que buscar la palabra "baja" en el texto entero
  // se topa con su propio nombre.
  const seccionBajas = pg.locator("section").filter({ hasText: /\d+ bajas?/i }).last();
  ok(await seccionBajas.getByText(NOMBRE).count() > 0,
     "aparece en la sección de bajas");
  ok((await seccionBajas.innerText()).includes("1 mesociclo · 2 series"),
     "y dice qué quedó guardado");

  console.log("\n── no perdió nada ──");
  const planes = await (await fetch(`${API}/rest/v1/planes?select=id&alumno_id=eq.${creado.id}`, { headers: cab })).json();
  const regs = await (await fetch(`${API}/rest/v1/registros?select=carga&alumno_id=eq.${creado.id}`, { headers: cab })).json();
  ok(planes.length === 1, "el mesociclo sigue en la base");
  ok(regs.length === 2 && regs.some((r) => r.carga === "62"), "y los pesos también");

  console.log("\n── ya no puede entrar ──");
  const ctx = await nav.newContext();
  const pgA = await ctx.newPage();
  await pgA.goto(`${APP}/entrar`, { waitUntil: "domcontentloaded" });
  await pgA.getByLabel("Tu mail").fill(email);
  await pgA.getByLabel("Tu contraseña").fill(claveAlumno);
  await pgA.getByRole("button", { name: "Entrar" }).click();
  await pgA.waitForTimeout(3000);
  ok(pgA.url().includes("/entrar"), "su contraseña deja de servir");

  console.log("\n── volver a darle el alta ──");
  await pg.goto(`${APP}/alumno/${creado.id}`, { waitUntil: "domcontentloaded" });
  await pg.waitForLoadState("networkidle");
  await pg.getByRole("button", { name: "Volver a darle el alta" }).click();
  await pg.waitForTimeout(2500);
  await pg.goto(`${APP}/`, { waitUntil: "domcontentloaded" });
  await pg.waitForLoadState("networkidle");
  ok(await pg.locator("main > ul").first().getByText(NOMBRE).count() > 0,
     "vuelve a la lista de activos");
  ok(await pg.locator("section").filter({ hasText: /\d+ bajas?/i })
       .getByText(NOMBRE).count() === 0,
     "y desaparece de las bajas");

  const pgB = await (await nav.newContext()).newPage();
  await pgB.goto(`${APP}/entrar`, { waitUntil: "domcontentloaded" });
  await pgB.getByLabel("Tu mail").fill(email);
  await pgB.getByLabel("Tu contraseña").fill(claveAlumno);
  await pgB.getByRole("button", { name: "Entrar" }).click();
  await pgB.waitForURL((x) => !String(x).includes("/entrar"), { timeout: 25000 });
  await pgB.waitForLoadState("networkidle");
  ok((await pgB.locator("body").innerText()).includes("Para la baja"),
     "entra de nuevo y su mesociclo está entero");
} finally {
  await nav.close();
  if (creado) await fetch(`${API}/auth/v1/admin/users/${creado.id}`, { method: "DELETE", headers: cab });
}

console.log("\n" + (fallos.length ? `❌ ${fallos.length} fallos` : "✅ todo bien"));
process.exit(fallos.length ? 1 : 0);
