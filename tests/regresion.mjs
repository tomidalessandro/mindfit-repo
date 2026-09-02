/* ============================================================================
   Regresión · MindFit
   ----------------------------------------------------------------------------
   Recorre TODOS los planes sembrados y anota, para cada ejercicio y semana,
   cuántas series tiene, cuál es el objetivo de reps, cuánto dura el descanso
   y si está encadenado al anterior.

   Sirve para comprobar que un cambio de estética, de textos o de migraciones
   no movió ningún número. La receta:

     1. antes de tocar nada:  node tests/regresion.mjs > /tmp/antes.txt
     2. hacés el cambio
     3. después:              node tests/regresion.mjs > /tmp/despues.txt
     4. diff /tmp/antes.txt /tmp/despues.txt   → tiene que salir vacío

   Así se verificó que sacar las notas de los bloques ("3 series del circuito",
   "pausa entre series") no cambiara ninguna rutina: 442 combinaciones
   idénticas antes y después.
   ============================================================================ */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = 'file://' + path.join(raiz, 'index.html');

const navegador = await chromium.launch();
const p = await (await navegador.newContext()).newPage();
await p.goto(APP);
await p.waitForTimeout(1500);

const filas = await p.evaluate(async () => {
  const out = [];
  for (const meta of indice) {
    plan = await store.read('plan:' + meta.id);
    cargas = normalizarCargas(await store.read('cargas:' + meta.id));
    migrarTiposDeCarga();
    plan.dias.forEach((d, di) => d.bloques.forEach((b, bi) => {
      b.ejercicios.forEach((ej, ei) => {
        for (let s = 0; s < plan.semanas; s++) {
          const info = seriesDe(ej, b, s);
          out.push([meta.id, di, bi, ei, s, info.n, info.objetivo,
                    descansoDe(b, ej), ej.unido ? 1 : 0, tipoCarga(ej)].join('|'));
        }
      });
      out.push(['BLOQUE', meta.id, di, bi, b.titulo, descansoDe(b), b.propaga].join('|'));
    }));
  }
  return out;
});

console.log(filas.join('\n'));
await navegador.close();
