import type { Bloque, Dia, Ejercicio } from "./modelo";

/** Los esqueletos que usa el coach al crear cosas.
 *
 * Portado del index.html de la v2: cada día nace con calentamiento y fuerza,
 * porque es como arma Tomás todos los mesociclos. Un día en blanco obligaría a
 * repetir esos dos bloques cuarenta veces.
 */

/** El ciclo de carga por defecto.
 *
 * En un mesociclo de 4 semanas: tres de carga y una de descarga. Con otra
 * cantidad, todas las semanas van juntas hasta que el coach lo cambie —
 * inventar una descarga donde el coach no la pidió sería peor que no poner
 * ninguna. */
export function cicloPorDefecto(semanas: number): number[][] {
  if (semanas === 4) return [[0, 1, 2], [3]];
  return [Array.from({ length: semanas }, (_, i) => i)];
}

export function ejercicioVacio(semanas: number): Ejercicio {
  return {
    // Vacío y no "Ejercicio nuevo": ese texto se veía como un nombre puesto a
    // propósito, así que si el coach se distraía le llegaba así al alumno. Y
    // además el buscador arrancaba filtrando por él, mostrando casi nada
    // justo cuando más sirve ver la biblioteca entera.
    nombre: "",
    video: "",
    carga: "kg",
    reps: Array(semanas).fill("8x3"),
  };
}

export function bloqueCalentamiento(): Bloque {
  // `propaga: todas` porque el calentamiento lleva el mismo peso todas las
  // semanas: no entra en la progresión.
  return { titulo: "Calentamiento", meta: "", propaga: "todas", ejercicios: [] };
}

export function bloqueFuerza(): Bloque {
  return { titulo: "Fuerza", meta: "", propaga: "ciclo", ejercicios: [] };
}

export function diaVacio(n: number): Dia {
  return {
    nombre: `Día ${n}`,
    num: String(n).padStart(2, "0"),
    bloques: [bloqueCalentamiento(), bloqueFuerza()],
  };
}

export function planVacio(dias: number): Dia[] {
  return Array.from({ length: dias }, (_, i) => diaVacio(i + 1));
}
