/** El modelo del plan, portado del index.html de la v2.
 *
 * La estructura de días → bloques → ejercicios sigue siendo un documento JSON
 * dentro de `planes.estructura`: la escribe una sola persona, el coach, y se
 * lee mucho más de lo que se escribe. Lo que cambió son los registros, que
 * ahora son una fila por serie.
 *
 * Todo lo de acá es función pura y sin dependencias, para poder probarlo
 * suelto. Si alguna se desvía de la v2, la app empieza a inventar o a perder
 * series sin avisar.
 */

export type TipoCarga = "kg" | "corporal" | "banda";

export type Ejercicio = {
  nombre: string;
  video?: string;
  carga?: TipoCarga;
  tipo?: string;
  reps?: string[];
  repsBase?: string[];
  series?: number;
  /** Va unido al anterior: forma una superserie con él. */
  unido?: boolean;
  propaga?: Propagacion;
};

export type Bloque = {
  titulo: string;
  meta?: string;
  propaga?: Propagacion;
  series?: number;
  descanso?: number;
  ejercicios: Ejercicio[];
};

export type Dia = {
  nombre: string;
  num: string;
  sub?: string;
  bloques: Bloque[];
};

/** Cómo se copia un peso a las otras semanas.
 *  `ciclo` → a las semanas del mismo grupo de carga
 *  `todas` → a todas
 *  `ninguna` → solo a esta */
export type Propagacion = "ciclo" | "todas" | "ninguna";

export const CARGAS: Record<TipoCarga, { col: string; unidad: string; hint: string }> = {
  kg: { col: "Peso", unidad: "kg", hint: "" },
  corporal: { col: "Peso", unidad: "kg", hint: "Peso corporal" },
  banda: { col: "Banda", unidad: "", hint: "color" },
};

export const COLORES_BANDA = [
  "Amarilla", "Roja", "Negra", "Verde", "Azul", "Naranja", "Violeta", "Gris",
];

const REPS_SERIES = /^(\d+)\s*[xX]\s*(\d+)$/;   // "8x3" = 8 reps por 3 series
const META_SERIES = /(\d+)\s*series/i;           // "3 series del circuito"

export function tipoCarga(ej: Ejercicio): TipoCarga {
  return ej.carga && ej.carga in CARGAS ? ej.carga : "kg";
}

/** Cuántas series lleva un ejercicio esa semana, y con qué objetivo de reps.
 *
 * "8x3" son 8 repeticiones por 3 series. En los circuitos la cantidad sale de
 * la nota del bloque ("3 series del circuito") y las reps son el texto tal
 * cual ('20" x lado'). El coach puede fijar `ej.series` y eso manda. */
export function seriesDe(
  ej: Ejercicio,
  bloque: Bloque,
  semana: number,
): { n: number; objetivo: string } {
  const txt = String(ej.reps?.[semana] ?? "").trim();

  const m = txt.match(REPS_SERIES);
  if (m) return { n: ej.series || Number(m[2]), objetivo: m[1] };

  const c = String(bloque.meta ?? "").match(META_SERIES);
  return {
    n: ej.series || bloque.series || (c ? Number(c[1]) : 3),
    objetivo: txt.replace(/\s*reps$/i, ""),
  };
}

export function modoDe(bloque: Bloque, ej: Ejercicio): Propagacion {
  return ej.propaga ?? bloque.propaga ?? "ciclo";
}

/** Las semanas a las que se copia un peso cargado en `semana`.
 *
 * El ciclo de carga agrupa las semanas que llevan el mismo peso: en un
 * mesociclo de 4 con descarga, [[0,1,2],[3]] dice que las tres primeras van
 * juntas y la cuarta va sola. */
export function hermanas(
  modo: Propagacion,
  semana: number,
  totalSemanas: number,
  cicloCarga: number[][],
): number[] {
  if (modo === "ninguna") return [semana];
  if (modo === "todas") return Array.from({ length: totalSemanas }, (_, i) => i);

  const grupo = cicloCarga.find((g) => g.includes(semana));
  return grupo ? [...grupo] : [semana];
}

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function nombreGrupo(cantidad: number): string {
  if (cantidad === 2) return "Superserie";
  if (cantidad === 3) return "Triserie";
  return "Circuito";
}

export type ItemAgrupado = {
  ej: Ejercicio;
  ei: number;
  etiqueta: string;
  ultimo: boolean;
};

/** Agrupa los ejercicios en superseries.
 *
 * Un ejercicio con `unido` sigue al anterior sin descanso en el medio. Cada
 * bloque arranca de nuevo en la A: en el método de MindFit la parte de fuerza
 * no continúa la letra de la entrada en calor. */
export function agruparEjercicios(
  bloque: Bloque,
): { letra: string; items: ItemAgrupado[] }[] {
  const grupos: { letra: string; items: ItemAgrupado[] }[] = [];

  bloque.ejercicios.forEach((ej, ei) => {
    if (!grupos.length || !ej.unido) {
      grupos.push({ letra: LETRAS[grupos.length] ?? "?", items: [] });
    }
    grupos[grupos.length - 1].items.push({ ej, ei, etiqueta: "", ultimo: false });
  });

  for (const g of grupos) {
    g.items.forEach((it, i) => {
      it.etiqueta = g.items.length > 1 ? g.letra + (i + 1) : g.letra;
      it.ultimo = i === g.items.length - 1;
    });
  }
  return grupos;
}

/** La clave con la que se indexa un registro en memoria.
 *
 * Es la misma tupla que hace única la fila en Postgres. Nada de la clave
 * `0-1-3-s2-e1` de la v2: eso era un apaño para meter cinco coordenadas en
 * una sola clave de un objeto JSON, y ya no hace falta. */
export function claveSerie(
  dia: number, bloque: number, ejercicio: number, semana: number, serie: number,
): string {
  return `${dia}|${bloque}|${ejercicio}|${semana}|${serie}`;
}

/** Cómo se lee una carga en el mensaje al coach. */
export function textoCarga(ej: Ejercicio, valor: string | null): string {
  const t = tipoCarga(ej);
  if (t === "banda") return valor ? "banda " + valor.toLowerCase() : "—";
  if (t === "corporal") return valor ? "corporal + " + valor + " kg" : "corporal";
  return valor ? valor + " kg" : "—";
}
