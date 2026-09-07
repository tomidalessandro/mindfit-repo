import type { Dia } from "./modelo";

/** La evolución de cargas: cada ejercicio con el peso más alto que registró
 *  en cada mesociclo, del más viejo al más nuevo.
 *
 * Es función pura para poder probarla sin base. Lo que decide si sirve o no
 * es qué considera "un peso": las cargas se guardan como texto porque hay
 * bandas ("roja") y peso corporal, así que solo entran las que son un número.
 * Un ejercicio de plancha no tiene progresión de kilos que mostrar, y meterlo
 * con un cero sería inventar un dato.
 */

export type PlanConEstructura = {
  id: string;
  titulo: string;
  creado: string;
  estructura: Dia[];
};

export type RegistroMinimo = {
  plan_id: string;
  dia: number;
  bloque: number;
  ejercicio: number;
  carga: string | null;
};

export type PuntoDeProgreso = {
  plan: string;
  kg: number;
};

export type ProgresoDeEjercicio = {
  nombre: string;
  puntos: PuntoDeProgreso[];
  /** Diferencia entre el primer mesociclo y el último. Null con un solo dato:
   *  con un punto no hay evolución que informar, y un "+0" haría creer que se
   *  estancó. */
  delta: number | null;
};

/** "40" → 40 · "40,5" → 40.5 · "roja" → null · "" → null */
export function kgDe(carga: string | null): number | null {
  if (!carga) return null;
  const n = parseFloat(carga.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function nombreDelEjercicio(
  estructura: Dia[], dia: number, bloque: number, ejercicio: number,
): string | null {
  return estructura?.[dia]?.bloques?.[bloque]?.ejercicios?.[ejercicio]?.nombre ?? null;
}

export function armarProgreso(
  planes: PlanConEstructura[],
  registros: RegistroMinimo[],
): ProgresoDeEjercicio[] {
  // Del más viejo al más nuevo: la evolución se lee en ese orden.
  const orden = [...planes].sort((a, b) => a.creado.localeCompare(b.creado));
  const porId = new Map(orden.map((p) => [p.id, p]));

  // ejercicio → plan → máximo
  const maximos = new Map<string, Map<string, number>>();

  for (const r of registros) {
    const kg = kgDe(r.carga);
    if (kg === null) continue;

    const plan = porId.get(r.plan_id);
    if (!plan) continue;

    const nombre = nombreDelEjercicio(plan.estructura, r.dia, r.bloque, r.ejercicio);
    // Puede no existir: el coach reordenó o borró ejercicios después de que
    // el alumno cargó el peso. El dato queda en la base pero ya no tiene
    // nombre que mostrar.
    if (!nombre) continue;

    const porPlan = maximos.get(nombre) ?? new Map<string, number>();
    const previo = porPlan.get(plan.id);
    if (previo === undefined || kg > previo) porPlan.set(plan.id, kg);
    maximos.set(nombre, porPlan);
  }

  const salida: ProgresoDeEjercicio[] = [];
  for (const [nombre, porPlan] of maximos) {
    const puntos = orden
      .filter((p) => porPlan.has(p.id))
      .map((p) => ({ plan: p.titulo, kg: porPlan.get(p.id)! }));

    if (puntos.length === 0) continue;

    salida.push({
      nombre,
      puntos,
      delta: puntos.length < 2
        ? null
        // Un decimal: las cargas van de a 2,5 kg y nadie necesita más.
        : Math.round((puntos[puntos.length - 1].kg - puntos[0].kg) * 10) / 10,
    });
  }

  return salida.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
