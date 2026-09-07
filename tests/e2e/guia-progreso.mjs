/* Las pantallas de guía y progreso.
 *
 *   npm run web            (en otra terminal)
 *   node tests/e2e/guia-progreso.mjs
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

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split("\n")
    .map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const [k, ...v] = l.split("="); return [k.trim(), v.join("=").trim().replace(/^["']|["']$/g, "")]; }),
);
const API = env.SUPABASE_URL.replace(/\/$/, "");
const cab = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, "Content-Type": "application/json" };

const u = (await (await fetch(`${API}/auth/v1/admin/users?filter=${encodeURIComponent(ALUMNO)}`, { headers: cab })).json())
  .users.find((x) => (x.email ?? "").toLowerCase() === ALUMNO);
await fetch(`${API}/auth/v1/admin/users/${u.id}`, { method: "PUT", headers: cab, body: JSON.stringify({ password: CLAVE }) });

const planes = await (await fetch(`${API}/rest/v1/planes?select=id&alumno_id=eq.${u.id}`, { headers: cab })).json();
for (const p of planes) await fetch(`${API}/rest/v1/registros?plan_id=eq.${p.id}`, { method: "DELETE", headers: cab });

const fallos = [];
const ok = (c, q) => { console.log((c ? "  ✓ " : "  ✗ ") + q); if (!c) fallos.push(q); };

const nav = await chromium.launch();
const pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
pg.on("pageerror", (e) => fallos.push("error de JS: " + String(e).slice(0, 120)));

try {
  await pg.goto(`${APP}/entrar`, { waitUntil: "domcontentloaded" });
  await pg.getByLabel("Tu mail").fill(ALUMNO);
  await pg.getByLabel("Tu contraseña").fill(CLAVE);
  await pg.getByRole("button", { name: "Entrar" }).click();
  await pg.waitForURL((x) => !String(x).includes("/entrar"), { timeout: 25000 });
  await pg.waitForLoadState("networkidle");

  console.log("── la guía ──");
  await pg.getByText("¿Cómo progresar?").click();
  await pg.waitForURL(/\/guia/, { timeout: 20000 });
  const guia = await pg.locator("body").innerText();
  ok(/doble progresión/i.test(guia), "muestra el método");
  ok(guia.includes("6.6.6") && guia.includes("8.8.8"), "muestra el ciclo de reps");
  ok(guia.includes("40 kg"), "la semana 4 sube la carga");
  ok(guia.includes("La técnica manda"), "muestra los cierres");

  console.log("\n── progreso, sin datos ──");
  await pg.goto(`${APP}/`, { waitUntil: "domcontentloaded" });
  await pg.getByText("Tu progreso").click();
  await pg.waitForURL(/\/progreso\//, { timeout: 20000 });
  await pg.waitForLoadState("networkidle");
  ok((await pg.locator("body").innerText()).includes("Todavía no hay pesos cargados"),
     "lo dice en vez de mostrar una lista vacía");

  console.log("\n── progreso, con datos ──");
  // Los registros se escriben por la API y no tecleando en la pantalla del
  // plan: así esta prueba mide el progreso y no el formulario, y los valores
  // son los que se esperan y no los que salgan de adivinar en qué bloque cayó
  // cada casillero.
  const plan = planes[0];
  await fetch(`${API}/rest/v1/registros`, {
    method: "POST",
    headers: { ...cab, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([
      // Tres series del mismo ejercicio: solo la más pesada cuenta.
      { plan_id: plan.id, alumno_id: u.id, dia: 0, bloque: 1, ejercicio: 0, semana: 0, serie: 1, carga: "40" },
      { plan_id: plan.id, alumno_id: u.id, dia: 0, bloque: 1, ejercicio: 0, semana: 0, serie: 2, carga: "55" },
      { plan_id: plan.id, alumno_id: u.id, dia: 0, bloque: 1, ejercicio: 0, semana: 0, serie: 3, carga: "50" },
      // Una banda: no tiene kilos y no debe aparecer.
      { plan_id: plan.id, alumno_id: u.id, dia: 0, bloque: 0, ejercicio: 1, semana: 0, serie: 1, carga: "roja" },
    ]),
  });

  await pg.goto(`${APP}/progreso/${u.id}`, { waitUntil: "domcontentloaded" });
  await pg.waitForLoadState("networkidle");
  const prog = await pg.locator("body").innerText();
  ok(!prog.includes("Todavía no hay pesos"), "ahora sí hay datos");
  ok(prog.includes("55 kg"), "toma el máximo de las series (55, no 40 ni 50)");
  ok(!prog.includes("roja"), "las bandas no aparecen: no tienen kilos que comparar");
  // El contador va en mayúsculas por CSS, e innerText devuelve lo renderizado.
  ok(/^1 ejercicio$/mi.test(prog), "cuenta un solo ejercicio");
} finally {
  await nav.close();
}

console.log("\n" + (fallos.length ? `❌ ${fallos.length} fallos` : "✅ todo bien"));
process.exit(fallos.length ? 1 : 0);
