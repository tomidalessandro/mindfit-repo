/* Pruebas de armarProgreso(), sin base ni navegador.
 *
 *   node tests/unidad/progreso.mjs
 *
 * Es la función que puede mentirle al alumno sobre su propia evolución, así
 * que conviene tenerla acorralada.
 */
import { strict as assert } from "node:assert";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

// El módulo es TypeScript; Node 24 lo entiende con el stripping nativo.
const { armarProgreso, kgDe } = await import(
  pathToFileURL(new URL("../../apps/web/lib/progreso.ts", import.meta.url).pathname).href
);

let ok = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log("  ✓ " + nombre); ok++; }
  catch (e) { console.log("  ✗ " + nombre + "\n      " + e.message); process.exitCode = 1; }
};

const dia = (nombres) => ({
  nombre: "Día 1", num: "01",
  bloques: [{ titulo: "Fuerza", ejercicios: nombres.map((n) => ({ nombre: n })) }],
});

const plan = (id, titulo, creado, nombres) => ({
  id, titulo, creado, estructura: [dia(nombres)],
});

const reg = (plan_id, ejercicio, carga) => ({ plan_id, dia: 0, bloque: 0, ejercicio, carga });

console.log("── kgDe ──");
prueba("un número entero", () => assert.equal(kgDe("40"), 40));
prueba("con coma decimal", () => assert.equal(kgDe("40,5"), 40.5));
prueba("con punto decimal", () => assert.equal(kgDe("40.5"), 40.5));
prueba("con espacios", () => assert.equal(kgDe("  42 "), 42));
prueba("una banda no es un peso", () => assert.equal(kgDe("roja"), null));
prueba("peso corporal tampoco", () => assert.equal(kgDe("corporal"), null));
prueba("vacío", () => assert.equal(kgDe(""), null));
prueba("null", () => assert.equal(kgDe(null), null));

console.log("\n── armarProgreso ──");

prueba("toma el máximo de cada mesociclo", () => {
  const r = armarProgreso(
    [plan("p1", "Agosto", "2026-08-01", ["Sentadilla"])],
    [reg("p1", 0, "40"), reg("p1", 0, "45"), reg("p1", 0, "42")],
  );
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].puntos, [{ plan: "Agosto", kg: 45 }]);
});

prueba("ordena del mesociclo más viejo al más nuevo", () => {
  const r = armarProgreso(
    [plan("p2", "Septiembre", "2026-09-01", ["Sentadilla"]),
     plan("p1", "Agosto", "2026-08-01", ["Sentadilla"])],
    [reg("p1", 0, "40"), reg("p2", 0, "50")],
  );
  assert.deepEqual(r[0].puntos.map((p) => p.plan), ["Agosto", "Septiembre"]);
});

prueba("el delta va del primero al último", () => {
  const r = armarProgreso(
    [plan("p1", "Agosto", "2026-08-01", ["Sentadilla"]),
     plan("p2", "Septiembre", "2026-09-01", ["Sentadilla"])],
    [reg("p1", 0, "40"), reg("p2", 0, "50")],
  );
  assert.equal(r[0].delta, 10);
});

prueba("con un solo mesociclo no hay delta", () => {
  const r = armarProgreso(
    [plan("p1", "Agosto", "2026-08-01", ["Sentadilla"])],
    [reg("p1", 0, "40")],
  );
  assert.equal(r[0].delta, null, "un punto no es una evolución");
});

prueba("un retroceso da delta negativo", () => {
  const r = armarProgreso(
    [plan("p1", "Agosto", "2026-08-01", ["Sentadilla"]),
     plan("p2", "Septiembre", "2026-09-01", ["Sentadilla"])],
    [reg("p1", 0, "50"), reg("p2", 0, "45")],
  );
  assert.equal(r[0].delta, -5);
});

prueba("las bandas y el peso corporal no entran", () => {
  const r = armarProgreso(
    [plan("p1", "Agosto", "2026-08-01", ["Plancha", "Band pull"])],
    [reg("p1", 0, "corporal"), reg("p1", 1, "roja")],
  );
  assert.deepEqual(r, [], "sin kilos no hay progresión que mostrar");
});

prueba("un registro sin ejercicio en el plan se ignora", () => {
  const r = armarProgreso(
    [plan("p1", "Agosto", "2026-08-01", ["Sentadilla"])],
    [reg("p1", 0, "40"), reg("p1", 9, "999")],
  );
  assert.equal(r.length, 1, "el coach borró ese ejercicio después");
  assert.equal(r[0].puntos[0].kg, 40);
});

prueba("un registro de un plan que no está se ignora", () => {
  const r = armarProgreso(
    [plan("p1", "Agosto", "2026-08-01", ["Sentadilla"])],
    [reg("fantasma", 0, "999")],
  );
  assert.deepEqual(r, []);
});

prueba("agrupa por nombre entre mesociclos distintos", () => {
  const r = armarProgreso(
    [plan("p1", "Agosto", "2026-08-01", ["Sentadilla", "Press"]),
     plan("p2", "Septiembre", "2026-09-01", ["Press", "Sentadilla"])],
    [reg("p1", 0, "40"), reg("p1", 1, "30"), reg("p2", 0, "35"), reg("p2", 1, "50")],
  );
  const sentadilla = r.find((x) => x.nombre === "Sentadilla");
  assert.deepEqual(sentadilla.puntos, [{ plan: "Agosto", kg: 40 }, { plan: "Septiembre", kg: 50 }],
    "el mismo ejercicio en otra posición sigue siendo el mismo");
});

prueba("los ejercicios salen ordenados alfabéticamente", () => {
  const r = armarProgreso(
    [plan("p1", "Agosto", "2026-08-01", ["Zancada", "Aductores"])],
    [reg("p1", 0, "20"), reg("p1", 1, "30")],
  );
  assert.deepEqual(r.map((x) => x.nombre), ["Aductores", "Zancada"]);
});

prueba("el delta se redondea a un decimal", () => {
  const r = armarProgreso(
    [plan("p1", "Agosto", "2026-08-01", ["Sentadilla"]),
     plan("p2", "Septiembre", "2026-09-01", ["Sentadilla"])],
    [reg("p1", 0, "40,25"), reg("p2", 0, "42,5")],
  );
  assert.equal(r[0].delta, 2.3);
});

console.log(`\n${process.exitCode ? "❌ hay fallos" : `✅ ${ok} pruebas`}`);
