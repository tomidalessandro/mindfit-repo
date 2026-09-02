/* ============================================================================
   Pruebas de humo · MindFit
   ----------------------------------------------------------------------------
   Abre la app en un navegador de verdad y recorre los caminos que más duelen
   si se rompen: cargar un peso, tildar una serie, crear y borrar un
   mesociclo, y que todo siga ahí después de recargar.

   Correr con:   npm install && npm test
   ============================================================================ */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = 'file://' + path.join(raiz, 'index.html');

let fallos = 0;
const ok = (cond, msg) => {
  if (cond) console.log('  ✓', msg);
  else { console.log('  ✗', msg); fallos++; }
};

const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 412, height: 900 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => { console.log('  ✗ error de JS en la página:', e.message); fallos++; });

console.log('\nArranque y semilla');
await p.goto(APP);
await p.waitForTimeout(1500);
ok((await p.$$('.cards .card')).length >= 4, 'la app arranca y lista los alumnos');
ok(await p.evaluate(() => document.documentElement.getAttribute('data-tema') === 'oscuro'),
   'abre en tema oscuro por defecto');

console.log('\nTema claro / oscuro');
await p.click('#tema'); await p.waitForTimeout(300);
ok(await p.evaluate(() => document.documentElement.getAttribute('data-tema') === 'claro'),
   'el botón cambia a tema claro');
await p.reload(); await p.waitForTimeout(1400);
ok(await p.evaluate(() => document.documentElement.getAttribute('data-tema') === 'claro'),
   'la elección de tema sobrevive a recargar');
await p.click('#tema'); await p.waitForTimeout(300);

console.log('\nCargar el entrenamiento');
await p.click('.card'); await p.waitForTimeout(500);
await p.click('.cards .card'); await p.waitForTimeout(900);
const enviar = () => p.getByRole('button', { name: 'Enviar pesos al coach' });
ok(await enviar().isDisabled(), 'el envío arranca deshabilitado');
const kg = (await p.$$('.setfield input'))[0];
await kg.fill('40'); await p.waitForTimeout(400);
ok(!(await enviar().isDisabled()), 'se habilita al cargar un peso');
await (await p.$$('.setok'))[0].click(); await p.waitForTimeout(500);
ok(await p.evaluate(() => document.querySelectorAll('.set--ok').length > 0),
   'la serie queda marcada como hecha');
ok(!/Copiar pesos/.test(await p.evaluate(() => document.body.innerText)),
   'no está el botón de copiar (se sacó a propósito)');

console.log('\nEl peso se guarda');
// Simula lo que pasa cuando el alumno bloquea el celular apenas carga el
// peso: la pagina se oculta antes de que venza el guardado con retardo.
await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await p.reload(); await p.waitForTimeout(1500);
ok(await p.evaluate(() => {
  const v = JSON.parse(localStorage.getItem('mf:cargas:karina-agosto') || '{}');
  return Object.values(v.v || {}).includes('40');
}), 'el peso sigue guardado después de recargar');

console.log('\nNotas viejas fuera');
await p.click('.card'); await p.waitForTimeout(400);
await p.click('.cards .card'); await p.waitForTimeout(900);
const texto = await p.evaluate(() => document.getElementById('view').innerText);
ok(!/series del circuito|sin pausa entre|pausa entre series/i.test(texto),
   'los encabezados de bloque ya no repiten las notas viejas');

console.log('\nBorrar un mesociclo');
await p.getByRole('button', { name: 'Modo coach' }).click(); await p.waitForTimeout(300);
await p.fill('#m-pin', 'mindfit'); await p.click('#m-ok'); await p.waitForTimeout(600);
const antes = await p.evaluate(() => indice.length);
await p.getByRole('button', { name: 'Eliminar mesociclo' }).click(); await p.waitForTimeout(400);
ok(await p.isDisabled('#m-ok'), 'pide escribir el nombre antes de habilitar');
await p.fill('#m-conf', 'no es el nombre'); await p.waitForTimeout(150);
ok(await p.isDisabled('#m-ok'), 'sigue bloqueado si el nombre no coincide');
await p.fill('#m-conf', 'agosto · full body'); await p.waitForTimeout(150);
ok(!(await p.isDisabled('#m-ok')), 'se habilita con el nombre correcto');
await p.click('#m-ok'); await p.waitForTimeout(1000);
ok(await p.evaluate((n) => indice.length === n - 1, antes), 'el mesociclo salió del índice');
await p.waitForTimeout(1200);
await p.reload(); await p.waitForTimeout(1500);
ok(await p.evaluate((n) => indice.length === n - 1, antes), 'sigue borrado después de recargar');

await navegador.close();
console.log(fallos === 0 ? '\nTodo en orden.\n' : `\n${fallos} chequeo(s) fallaron.\n`);
process.exit(fallos === 0 ? 0 : 1);
