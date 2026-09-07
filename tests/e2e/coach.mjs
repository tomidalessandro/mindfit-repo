/* El recorrido del coach: sus alumnos → la ficha de uno → su mesociclo.
 *
 *   npm run web            (en otra terminal)
 *   node tests/e2e/coach.mjs
 *   APP_URL=https://mindfit-repo.vercel.app node tests/e2e/coach.mjs
 *
 * Verifica además lo que el coach NO puede: entrar a la ficha de alguien que
 * no es su alumno. RLS devuelve null y la página contesta 404, igual que si
 * esa persona no existiera — un "no tenés permiso" ya confirmaría que sí.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const APP = process.env.APP_URL ?? "http://localhost:3000";

const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8").split("\n")
    .map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const [k, ...v] = l.split("="); return [k.trim(), v.join("=").trim().replace(/^["']|["']$/g, "")]; }),
);
const API = env.SUPABASE_URL.replace(/\/$/, "");
const cabeceras = {
  apikey: env.SUPABASE_SECRET_KEY,
  Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
  "Content-Type": "application/json",
};
const COACH = env.COACH_EMAIL.toLowerCase();
const CLAVE = "prueba-e2e-no-usar-" + process.pid;

async function ponerClave(email) {
  const r = await fetch(`${API}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, { headers: cabeceras });
  const u = (await r.json()).users.find((x) => (x.email ?? "").toLowerCase() === email);
  if (!u) throw new Error(`no existe ${email}`);
  await fetch(`${API}/auth/v1/admin/users/${u.id}`, {
    method: "PUT", headers: cabeceras, body: JSON.stringify({ password: CLAVE }),
  });
  return u.id;
}

const fallos = [];
const ok = (c, q) => { console.log((c ? "  ✓ " : "  ✗ ") + q); if (!c) fallos.push(q); };

await ponerClave(COACH);

const navegador = await chromium.launch();
const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } });
pagina.on("pageerror", (e) => fallos.push("error de JS: " + String(e).slice(0, 120)));

try {
  console.log("── entrar como coach ──");
  await pagina.goto(`${APP}/entrar`, { waitUntil: "domcontentloaded" });
  await pagina.getByLabel("Tu mail").fill(COACH);
  await pagina.getByLabel("Tu contraseña").fill(CLAVE);
  await pagina.getByRole("button", { name: "Entrar" }).click();
  await pagina.waitForURL((u) => !String(u).includes("/entrar"), { timeout: 25000 });
  await pagina.waitForLoadState("networkidle");
  ok((await pagina.locator("body").innerText()).includes("Tus alumnos"), "ve la lista de sus alumnos");

  console.log("\n── abrir la ficha de un alumno ──");
  await pagina.getByText("Karina", { exact: true }).click();
  await pagina.waitForURL(/\/alumno\//, { timeout: 20000 });
  await pagina.waitForLoadState("networkidle");
  const ficha = await pagina.locator("body").innerText();
  ok(!ficha.includes("could not be found"), "la ficha existe (no es 404)");
  ok(ficha.includes("Karina"), "muestra el nombre");
  ok(ficha.includes("Agosto"), "lista su mesociclo");

  console.log("\n── entrar al mesociclo del alumno ──");
  await pagina.getByText("Agosto · Full body").click();
  await pagina.waitForURL(/\/plan\//, { timeout: 20000 });
  await pagina.waitForLoadState("networkidle");
  const plan = await pagina.locator("body").innerText();
  ok(plan.includes("Día 1"), "abre el plan");
  ok(plan.includes("viendo la rutina de tu alumno"), "avisa que es de otra persona");

  console.log("\n── volver ──");
  await pagina.getByText("‹ Volver").click();
  await pagina.waitForURL(/\/alumno\//, { timeout: 20000 });
  ok(/\/alumno\//.test(pagina.url()), "vuelve a la ficha del alumno");

  console.log("\n── lo que el coach no puede ver ──");
  // Un id que no le corresponde a nadie. RLS devuelve null y la página
  // contesta 404, igual que si la persona existiera pero no fuera su alumno:
  // las dos se responden igual a propósito, porque un "no tenés permiso"
  // confirmaría que esa cuenta existe.
  //
  // El caso "alumno de otro coach" no se prueba acá porque haría falta montar
  // un segundo gimnasio en producción. Está cubierto en supabase/tests/rls.sql
  // — "el Coach B no ve a los alumnos del Coach A" — que es además el lugar
  // correcto: eso lo decide Postgres, no la app.
  await pagina.goto(`${APP}/alumno/00000000-0000-4000-8000-000000000000`,
                    { waitUntil: "domcontentloaded" });
  await pagina.waitForLoadState("networkidle");
  ok((await pagina.locator("body").innerText()).includes("could not be found"),
     "una ficha que no le corresponde da 404");
} finally {
  await navegador.close();
}

console.log("\n" + (fallos.length ? `❌ ${fallos.length} fallos` : "✅ todo bien"));
process.exit(fallos.length ? 1 : 0);
