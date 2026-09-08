/* El buscador de ejercicios de la biblioteca.
 *
 *   npm run web            (en otra terminal)
 *   node tests/e2e/buscador.mjs
 *
 * Existe porque el <datalist> que había antes no se veía en el teléfono. Así
 * que lo que más importa acá es medir: que la lista aparezca, que ocupe
 * espacio real en pantalla, y que sus opciones se puedan tocar con un pulgar.
 *
 * Crea y borra su propio mesociclo.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const APP = process.env.APP_URL ?? "http://localhost:3000";
const COACH = process.env.EMAIL_COACH ?? "e2e-coach@mindfit.local";
const ALUMNO = process.env.EMAIL_ALUMNO ?? "e2e-alumno@mindfit.local";
const CLAVE = "prueba-e2e-no-usar-" + process.pid;
const TITULO = "Buscador " + process.pid;

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
const uAlumno = await usuario(ALUMNO);
if (!uCoach || !uAlumno) throw new Error("faltan las cuentas de prueba. Corré: npm run test:cuentas");
await fetch(`${API}/auth/v1/admin/users/${uCoach.id}`, { method: "PUT", headers: cab, body: JSON.stringify({ password: CLAVE }) });

const nav = await chromium.launch();
try {
  // Un teléfono de verdad: 390x844 es un iPhone 14.
  const pg = await nav.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  pg.on("pageerror", (e) => fallos.push("error de JS: " + String(e).slice(0, 120)));

  await pg.goto(`${APP}/entrar`, { waitUntil: "domcontentloaded" });
  await pg.getByLabel("Tu mail").fill(COACH);
  await pg.getByLabel("Tu contraseña").fill(CLAVE);
  await pg.getByRole("button", { name: "Entrar" }).click();
  await pg.waitForURL((x) => !String(x).includes("/entrar"), { timeout: 25000 });

  await pg.goto(`${APP}/alumno/${uAlumno.id}`, { waitUntil: "domcontentloaded" });
  await pg.waitForLoadState("networkidle");
  await pg.getByRole("button", { name: "+ Nuevo mesociclo" }).click();
  await pg.getByLabel("Título").fill(TITULO);
  await pg.getByRole("button", { name: "Crear" }).click();
  await pg.waitForURL(/\/plan\//, { timeout: 25000 });
  await pg.waitForLoadState("networkidle");

  await pg.getByRole("button", { name: "Editar" }).click();
  await pg.getByRole("button", { name: "+ Ejercicio" }).last().click();
  await pg.waitForTimeout(400);

  const campo = pg.getByRole("combobox").first();
  const lista = pg.getByRole("listbox").first();

  console.log("── al tocarlo se abre ──");
  ok(await lista.count() === 0, "cerrado mientras no lo tocan");
  await campo.click();
  await lista.waitFor({ timeout: 8000 });
  ok(await lista.isVisible(), "se abre al tocar el campo");

  console.log("\n── se ve de verdad en un teléfono ──");
  const caja = await lista.boundingBox();
  ok(caja !== null && caja.height > 100,
     `la lista mide ${Math.round(caja?.height ?? 0)}px de alto, no un renglón`);
  ok(caja.width > 200, `y ${Math.round(caja.width)}px de ancho`);
  ok(caja.y + 1 < 844 && caja.y > 0, "y entra en la pantalla");

  // Dentro del listbox: `getByRole("option")` suelto también agarra las
  // <option> del <select> de tipo de carga, que están en la misma tarjeta.
  const opciones = lista.getByRole("option");
  ok(await opciones.count() > 10, `muestra la biblioteca (${await opciones.count()} ejercicios)`);

  const alto = (await opciones.first().boundingBox()).height;
  ok(alto >= 44, `cada opción mide ${Math.round(alto)}px: se toca con el pulgar`);

  console.log("\n── filtra mientras se escribe ──");
  await campo.fill("sentad");
  await pg.waitForTimeout(300);
  const filtradas = await pg.getByRole("listbox").first().getByRole("option").allInnerTexts();
  const intrusas = filtradas.filter((t) => !/sentad/i.test(t));
  if (intrusas.length) console.log("      intrusas:", JSON.stringify(intrusas.slice(0, 4)));
  ok(filtradas.length > 0 && intrusas.length === 0,
     `filtra a ${filtradas.length} y todas coinciden`);

  console.log("\n── ignora los acentos ──");
  await campo.fill("bulgara");
  await pg.waitForTimeout(300);
  ok((await pg.getByRole("listbox").first().getByRole("option").allInnerTexts())
       .some((t) => /búlgara/i.test(t)),
     "\"bulgara\" encuentra \"búlgara\"");

  console.log("\n── se elige tocando ──");
  await pg.getByRole("listbox").first().getByRole("option").first().click();
  await pg.waitForTimeout(600);
  ok((await campo.inputValue()).toLowerCase().includes("búlgara"), "queda el nombre elegido");
  ok(await pg.getByRole("listbox").count() === 0, "y la lista se cierra");
  const video = pg.locator('input[inputmode="url"]').first();
  ok((await video.inputValue()).includes("http"), "y se trajo el video");

  console.log("\n── acepta lo que no está en la biblioteca ──");
  await campo.fill("Ejercicio inventado por el coach");
  await pg.waitForTimeout(300);
  ok((await pg.getByRole("listbox").innerText()).includes("Escribilo igual"),
     "lo dice en vez de dejar la lista vacía y muda");
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(1200);
  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.waitForLoadState("networkidle");
  ok((await pg.locator("body").innerText()).includes("Ejercicio inventado"),
     "y se guarda igual");
} finally {
  await nav.close();
  await fetch(`${API}/rest/v1/planes?titulo=eq.${encodeURIComponent(TITULO)}`, { method: "DELETE", headers: cab });
}

console.log("\n" + (fallos.length ? `❌ ${fallos.length} fallos` : "✅ todo bien"));
process.exit(fallos.length ? 1 : 0);
