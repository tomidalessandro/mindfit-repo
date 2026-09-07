/* El cronómetro de descanso.
 *
 *   npm run web            (en otra terminal)
 *   node tests/e2e/cronometro.mjs
 *
 * Verifica que arranque al marcar una serie, que cuente para atrás, que los
 * botones lo ajusten, y —lo que más importa— que NO arranque al desmarcar:
 * desmarcar es corregir un error, no terminar una serie.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const APP = process.env.APP_URL ?? "http://localhost:3000";
const ALUMNO = process.env.EMAIL_ALUMNO ?? "nicodalessandro11@gmail.com";
const CLAVE = "prueba-e2e-no-usar-" + process.pid;

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split("\n")
    .map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const [k, ...v] = l.split("="); return [k.trim(), v.join("=").trim().replace(/^["']|["']$/g, "")]; }),
);
const API = env.SUPABASE_URL.replace(/\/$/, "");
const cab = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`, "Content-Type": "application/json" };

const r = await fetch(`${API}/auth/v1/admin/users?filter=${encodeURIComponent(ALUMNO)}`, { headers: cab });
const u = (await r.json()).users.find((x) => (x.email ?? "").toLowerCase() === ALUMNO);
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
  await pg.getByText("Prueba · Full body").click();
  await pg.waitForURL(/\/plan\//, { timeout: 20000 });
  await pg.waitForLoadState("networkidle");

  const crono = pg.locator('[role="timer"]');
  const fuerza = pg.locator("section").filter({ hasText: "Fuerza" }).first();

  console.log("── al abrir, no hay cronómetro ──");
  ok((await crono.count()) === 0, "no aparece solo");

  console.log("\n── marcar una serie lo arranca ──");
  await fuerza.locator("button[aria-pressed]").first().click();
  await crono.waitFor({ timeout: 8000 });
  ok(await crono.isVisible(), "aparece al tildar");
  const texto = await crono.innerText();
  ok(/Descanso/.test(texto), "dice de qué es la pausa");
  // El bloque de Fuerza no declara descanso: son los 2:00 por defecto.
  ok(/[12]:\d\d/.test(texto), `muestra el tiempo (${texto.match(/\d+:\d\d/)?.[0]})`);

  console.log("\n── cuenta para atrás ──");
  const t1 = (await crono.innerText()).match(/(\d+):(\d\d)/);
  await pg.waitForTimeout(2500);
  const t2 = (await crono.innerText()).match(/(\d+):(\d\d)/);
  const seg = (m) => Number(m[1]) * 60 + Number(m[2]);
  ok(seg(t2) < seg(t1), `baja: ${t1[0]} → ${t2[0]}`);

  console.log("\n── los botones lo ajustan ──");
  const antes = seg((await crono.innerText()).match(/(\d+):(\d\d)/));
  await crono.getByRole("button", { name: "Sumar quince segundos" }).click();
  await pg.waitForTimeout(300);
  const despues = seg((await crono.innerText()).match(/(\d+):(\d\d)/));
  ok(despues > antes, `+15 suma (${antes}s → ${despues}s)`);

  console.log("\n── \"Listo\" lo cierra ──");
  await crono.getByRole("button", { name: "Listo" }).click();
  await pg.waitForTimeout(500);
  ok((await crono.count()) === 0, "se cierra a mano");

  console.log("\n── desmarcar NO lo arranca ──");
  await fuerza.locator("button[aria-pressed]").first().click();   // desmarca
  await pg.waitForTimeout(1200);
  ok((await crono.count()) === 0, "corregir un error no dispara una pausa");

  console.log("\n── se puede apagar ──");
  await pg.getByLabel("Cronometrar los descansos").uncheck();
  await fuerza.locator("button[aria-pressed]").first().click();   // marca
  await pg.waitForTimeout(1200);
  ok((await crono.count()) === 0, "apagado, no aparece");

  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.waitForLoadState("networkidle");
  ok(!(await pg.getByLabel("Cronometrar los descansos").isChecked()),
     "la preferencia sobrevive a la recarga");
} finally {
  await nav.close();
}

console.log("\n" + (fallos.length ? `❌ ${fallos.length} fallos` : "✅ todo bien"));
process.exit(fallos.length ? 1 : 0);
