"use client";

import { useId, useMemo, useRef, useState } from "react";

import estilos from "./buscador.module.css";

export type EjercicioBiblioteca = {
  nombre: string;
  video: string | null;
  carga: string;
};

/** El buscador de ejercicios de la biblioteca.
 *
 * Reemplaza al `<datalist>`, que parecía la solución obvia y no lo era: cada
 * navegador lo dibuja como quiere, en escritorio cuesta acertarle, y en el
 * teléfono muchos directamente no lo muestran. Un desplegable que a veces no
 * aparece es peor que no tener ninguno, porque el coach no sabe si la
 * biblioteca está vacía o si la app está rota.
 *
 * Sigue aceptando texto libre: si el ejercicio no está en la biblioteca, se
 * escribe y listo. La lista sugiere, no obliga.
 */
export function BuscadorEjercicio({
  valor,
  biblioteca,
  onNombre,
  onElegir,
}: {
  valor: string;
  biblioteca: EjercicioBiblioteca[];
  /** Escribió a mano: solo cambia el nombre. */
  onNombre: (nombre: string) => void;
  /** Eligió uno de la lista: se trae también su video y su tipo de carga. */
  onElegir: (ej: EjercicioBiblioteca) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const idLista = useId();
  const campo = useRef<HTMLInputElement>(null);

  const normal = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const encontrados = useMemo(() => {
    const q = normal(valor.trim());
    // Sin texto se muestra la biblioteca entera: al agregar un ejercicio
    // nuevo el campo está vacío, y ahí es cuando más sirve ver qué hay.
    const lista = !q
      ? biblioteca
      : biblioteca.filter((e) => normal(e.nombre).includes(q));
    return lista.slice(0, 60);
  }, [valor, biblioteca]);

  function elegir(e: EjercicioBiblioteca) {
    onElegir(e);
    setAbierto(false);
    campo.current?.blur();
  }

  return (
    <div className={estilos.envoltorio}>
      <input
        ref={campo}
        className={estilos.campo}
        value={valor}
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={
          abierto && encontrados[activo] ? `${idLista}-${activo}` : undefined
        }
        placeholder="Buscá o escribí el ejercicio"
        onFocus={() => { setAbierto(true); setActivo(0); }}
        // Un pelo de espera antes de cerrar: sin esto el blur mata la lista
        // antes de que el toque llegue a la opción, y en el teléfono no se
        // puede elegir nada.
        onBlur={() => setTimeout(() => setAbierto(false), 120)}
        onChange={(e) => { onNombre(e.target.value); setAbierto(true); setActivo(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAbierto(true);
            setActivo((i) => Math.min(i + 1, encontrados.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActivo((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && abierto && encontrados[activo]) {
            // Solo intercepta el Enter si hay algo que elegir: si no, tiene
            // que seguir comportándose como un campo de texto cualquiera.
            e.preventDefault();
            elegir(encontrados[activo]);
          } else if (e.key === "Escape") {
            setAbierto(false);
          }
        }}
      />

      {abierto && (
        <ul className={estilos.lista} id={idLista} role="listbox">
          {encontrados.length === 0 ? (
            <li className={estilos.vacio}>
              No está en la biblioteca. Escribilo igual y queda cargado.
            </li>
          ) : (
            encontrados.map((e, i) => (
              <li key={e.nombre}>
                <button
                  type="button"
                  id={`${idLista}-${i}`}
                  role="option"
                  aria-selected={i === activo}
                  className={`${estilos.opcion} ${i === activo ? estilos.activa : ""}`}
                  // onMouseDown y no onClick: el clic llega después del blur
                  // del campo, y para entonces la lista ya se cerró.
                  onMouseDown={(ev) => { ev.preventDefault(); elegir(e); }}
                  onMouseEnter={() => setActivo(i)}
                >
                  <span className={estilos.nombre}>{e.nombre}</span>
                  <span className={estilos.tipo}>
                    {e.carga === "banda" ? "banda" : e.carga === "corporal" ? "corporal" : "kg"}
                    {e.video ? " · video" : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
