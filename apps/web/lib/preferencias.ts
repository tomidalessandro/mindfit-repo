"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Preferencias que viven en el navegador de cada uno.
 *
 * Se lee con `useSyncExternalStore` y no con un efecto que llame a setState.
 * El motivo no es de estilo: `localStorage` no existe en el servidor, así que
 * leerlo en el render rompe la hidratación, y leerlo en un efecto provoca un
 * segundo render en cadena. Este hook es exactamente la herramienta para
 * suscribirse a algo que vive fuera de React, y encima deja el valor del
 * servidor explícito.
 */

type Escucha = () => void;
const escuchas = new Set<Escucha>();

function avisar() {
  for (const e of escuchas) e();
}

function suscribir(e: Escucha) {
  escuchas.add(e);
  // Otra pestaña del mismo alumno también cambia la preferencia.
  window.addEventListener("storage", e);
  return () => {
    escuchas.delete(e);
    window.removeEventListener("storage", e);
  };
}

export function leerBandera(clave: string, porDefecto: boolean): boolean {
  try {
    const v = localStorage.getItem(clave);
    return v === null ? porDefecto : v !== "0";
  } catch {
    // Navegador con el almacenamiento bloqueado (modo privado, ajustes).
    return porDefecto;
  }
}

/** Una preferencia booleana persistida. Devuelve [valor, cambiar]. */
export function useBandera(
  clave: string,
  porDefecto = true,
): [boolean, (valor: boolean) => void] {
  const valor = useSyncExternalStore(
    suscribir,
    () => leerBandera(clave, porDefecto),
    // En el servidor no hay navegador: se renderiza el valor por defecto y en
    // cuanto hidrata se corrige solo si el alumno lo tenía distinto.
    () => porDefecto,
  );

  const cambiar = useCallback(
    (nuevo: boolean) => {
      try {
        localStorage.setItem(clave, nuevo ? "1" : "0");
      } catch {
        // No sobrevive a la recarga, pero la sesión sigue andando.
      }
      avisar();
    },
    [clave],
  );

  return [valor, cambiar];
}
