/* El link de acceso directo: /e/<codigo>
 *
 *   npm run web            (en otra terminal)
 *   node tests/e2e/acceso.mjs
 *
 * Verifica que entre sin mail y sin contraseña, que la sesión sea de verdad
 * —o sea, que RLS siga filtrando y cada uno vea lo suyo— y que un código
 * inventado no abra nada.
 *
 * Nota sobre las esperas: acá NO se usa `networkidle`. El link encadena
 * cuatro navegaciones (/e → verify de Supabase → la raíz con el fragmento →
 * /entrar) y encima el rescate del fragmento dispara un refresh, así que la
 * red no se queda quieta nunca y la espera no vuelve más. Se espera por el
 * texto que se quiere ver, que además es lo que de verdad importa.
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
const cabeceras = {
  apikey: env.SUPABASE_SECRET_KEY,
  Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
};

const fallos = [];
const ok = (c, q) => { console.log((c ? "  ✓ " : "  ✗ ") + q); if (!c) fallos.push(q); };

/** Espera a que aparezca un texto, aguantando las navegaciones del medio.
 *
 * Los `waitFor` de Playwright se atan a un contexto de ejecución y mueren
 * apenas la página navega —"execution context was destroyed"—, que es
 * exactamente lo que pasa acá: el link encadena cinco saltos. Sondear es feo
 * pero es lo único que sobrevive al viaje. */
async function esperarTexto(pagina, texto, ms = 30000) {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    try {
      if ((await pagina.locator("body").innerText()).includes(texto)) return true;
    } catch {
      // Navegó justo ahora. Se reintenta en el próximo ciclo.
    }
    await pagina.waitForTimeout(400);
  }
  return false;
}

const r = await fetch(
  `${env.SUPABASE_URL}/rest/v1/perfiles?select=nombre,rol,codigo_acceso&order=rol.desc`,
  { headers: cabeceras });
const perfiles = (await r.json()).filter((p) => p.codigo_acceso);
console.log(`${perfiles.length} perfiles con acceso directo\n`);

const navegador = await chromium.launch();
try {
  for (const p of perfiles) {
    console.log(`── ${p.nombre} (${p.rol}) ──`);
    const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 } });
    const esperado = p.rol === "coach" ? "Tus alumnos" : "Tus rutinas";

    await pagina.goto(`${APP}/e/${p.codigo_acceso}`, { waitUntil: "domcontentloaded" });

    // El link encadena cinco navegaciones: /e → verify de Supabase → la raíz
    // con el fragmento → /entrar → y de vuelta a la raíz ya con sesión.
    const entro = await esperarTexto(pagina, esperado);

    ok(entro, "entra directo, sin pasar por el login");
    if (entro) {
      const texto = await pagina.locator("body").innerText();
      ok(texto.includes(p.nombre), `la sesión es de ${p.nombre}`);
      ok(!pagina.url().includes("/entrar"), "no queda en /entrar");
    }
    await pagina.close();
    console.log("");
  }

  console.log("── un código inventado ──");
  const intruso = await navegador.newPage();
  await intruso.goto(`${APP}/e/estonoesuncodigovalido99`, { waitUntil: "domcontentloaded" });
  await intruso.getByText("Poné tu mail").waitFor({ timeout: 15000 }).catch(() => {});
  ok(intruso.url().includes("/entrar"), "no abre nada y manda al login");
  await intruso.close();
} finally {
  await navegador.close();
}

console.log("\n" + (fallos.length ? `❌ ${fallos.length} fallos` : "✅ todo bien"));
process.exit(fallos.length ? 1 : 0);
