/* Prueba de punta a punta de la pantalla del plan, en un Chromium de verdad.
 *
 *   npm run web            (en otra terminal)
 *   node tests/e2e/plan.mjs
 *
 * Recorre lo que más duele si se rompe: entrar con el link mágico, cargar un
 * peso, tildar una serie, recargar y que siga ahí, y que la propagación
 * respete el ciclo de carga.
 *
 * Dos cosas que la hacen repetible, y que costaron un rato de falsos fallos:
 *
 *  · Borra los registros del plan antes de empezar. Sin eso, la segunda
 *    corrida encuentra los tildes que dejó la primera y los interpreta al
 *    revés: el clic que debía marcar, desmarca.
 *  · Genera su propio link mágico. Son de un solo uso, y reutilizar uno da un
 *    `otp_expired` que parece un bug de la app y no lo es.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const APP = process.env.APP_URL ?? "http://localhost:3000";
const ALUMNO = process.env.EMAIL_ALUMNO ?? "nicodalessandro11@gmail.com";

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8")
    .split("\n").map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const [k, ...v] = l.split("="); return [k.trim(), v.join("=").trim().replace(/^["']|["']$/g, "")]; }),
);
const API = env.SUPABASE_URL.replace(/\/$/, "");
const cabeceras = {
  apikey: env.SUPABASE_SECRET_KEY,
  Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
  "Content-Type": "application/json",
};

async function linkMagico(email) {
  const r = await fetch(`${API}/auth/v1/admin/generate_link`, {
    method: "POST", headers: cabeceras,
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!r.ok) throw new Error(`generate_link: ${r.status} ${await r.text()}`);
  return (await r.json()).action_link;
}

/** Deja el plan sin registros, para que cada corrida empiece igual. */
async function limpiar() {
  const r = await fetch(`${API}/rest/v1/planes?select=id&alumno_id=eq.${await idDelAlumno()}`,
                        { headers: cabeceras });
  const planes = await r.json();
  for (const p of planes) {
    await fetch(`${API}/rest/v1/registros?plan_id=eq.${p.id}`, { method: "DELETE", headers: cabeceras });
  }
  return planes.length;
}

async function idDelAlumno() {
  const r = await fetch(`${API}/auth/v1/admin/users?filter=${encodeURIComponent(ALUMNO)}`,
                        { headers: cabeceras });
  return (await r.json()).users[0].id;
}

const fallos = [];
const ok = (cond, que) => {
  console.log((cond ? "  ✓ " : "  ✗ ") + que);
  if (!cond) fallos.push(que);
};

console.log("── preparar ──");
console.log(`  limpiados los registros de ${await limpiar()} plan(es)`);

const navegador = await chromium.launch();
// Tamaño de celular: es donde se usa esto, entre series.
const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } });
pagina.on("pageerror", (e) => fallos.push("error de JS: " + String(e).slice(0, 120)));

try {
  console.log("\n── entrar con el link mágico ──");
  await pagina.goto(await linkMagico(ALUMNO), { waitUntil: "networkidle" });
  await pagina.waitForURL((u) => !String(u).includes("/entrar"), { timeout: 20000 });
  await pagina.waitForLoadState("networkidle");
  ok(!pagina.url().includes("/entrar"), "entra sin quedar en el loop de /entrar");

  console.log("\n── abrir el mesociclo ──");
  await pagina.getByText("Agosto · Full body").click();
  await pagina.waitForURL(/\/plan\//, { timeout: 20000 });
  await pagina.waitForLoadState("networkidle");
  const cuerpo = await pagina.locator("body").innerText();
  ok(cuerpo.includes("Día 1"), "muestra los días");
  ok(cuerpo.includes("S4"), "muestra las 4 semanas");

  // El bloque de Fuerza, que propaga por ciclo. El de Calentamiento propaga a
  // todas las semanas, y ahí la prueba de la descarga no diría nada.
  const fuerza = pagina.locator("section").filter({ hasText: "Fuerza" }).first();
  const peso = () => fuerza.locator('label:not([class*="Reps"]) input').first();
  const tilde = () => fuerza.locator("button[aria-pressed]").first();

  console.log("\n── cargar un peso y tildar la serie ──");
  ok((await peso().inputValue()) === "", "arranca vacío");
  ok((await tilde().getAttribute("aria-pressed")) === "false", "arranca sin tildar");

  await peso().fill("42.5");
  await pagina.waitForTimeout(1000);          // el retardo de guardado
  await tilde().click();
  await pagina.waitForTimeout(1000);
  ok((await tilde().getAttribute("aria-pressed")) === "true", "la serie queda marcada");

  console.log("\n── recargar: ¿sobrevivió al viaje a la base? ──");
  await pagina.reload({ waitUntil: "networkidle" });
  ok((await peso().inputValue()) === "42.5", "el peso volvió de la base");
  ok((await tilde().getAttribute("aria-pressed")) === "true", "el tilde volvió de la base");

  console.log("\n── propagación en un bloque de ciclo, con [[0,1,2],[3]] ──");
  await pagina.getByRole("button", { name: "S2", exact: true }).click();
  await pagina.waitForTimeout(500);
  ok((await peso().inputValue()) === "42.5", "S2 hereda: va en el mismo grupo de carga");

  await pagina.getByRole("button", { name: "S4", exact: true }).click();
  await pagina.waitForTimeout(500);
  ok((await peso().inputValue()) === "", "S4 queda vacía: es la descarga, otro grupo");

  console.log("\n── un peso puesto a mano no se pisa ──");
  await peso().fill("30");
  await pagina.waitForTimeout(1000);
  await pagina.getByRole("button", { name: "S1", exact: true }).click();
  await pagina.waitForTimeout(400);
  await peso().fill("45");                    // cambia S1: no debe tocar S4
  await pagina.waitForTimeout(1000);
  await pagina.getByRole("button", { name: "S4", exact: true }).click();
  await pagina.waitForTimeout(500);
  ok((await peso().inputValue()) === "30", "S4 conserva su peso propio");
} finally {
  await navegador.close();
}

console.log("\n" + (fallos.length ? `❌ ${fallos.length} fallos` : "✅ todo bien"));
process.exit(fallos.length ? 1 : 0);
