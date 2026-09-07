"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CARGAS, type Bloque, type Dia, type Ejercicio, type TipoCarga } from "@/lib/modelo";
import { bloqueFuerza, diaVacio, ejercicioVacio } from "@/lib/plantillas";
import { clienteNavegador } from "@/lib/supabase/navegador";

import estilos from "./editor.module.css";

/** La edición de la estructura del plan, solo para el coach.
 *
 * A diferencia de los registros, esto guarda el documento entero de una: la
 * estructura la escribe una sola persona y no hay dos coaches editando el
 * mismo mesociclo al mismo tiempo. Es la misma razón por la que `estructura`
 * siguió siendo JSONB y no se partió en tablas.
 */

type Props = {
  planId: string;
  dias: Dia[];
  semanas: number;
  diaActivo: number;
  biblioteca: { nombre: string; video: string | null; carga: string }[];
  onCambio: (dias: Dia[]) => void;
};

const RETARDO = 700;

export function Editor({
  planId, dias, semanas, diaActivo, biblioteca, onCambio,
}: Props) {
  const [guardando, setGuardando] = useState(false);
  const [falló, setFalló] = useState(false);
  const pendiente = useRef<Dia[] | null>(null);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vaciar = useCallback(async () => {
    if (reloj.current) { clearTimeout(reloj.current); reloj.current = null; }
    const cambio = pendiente.current;
    if (!cambio) return;
    pendiente.current = null;

    setGuardando(true);
    const { error } = await clienteNavegador()
      .from("planes")
      .update({ estructura: cambio })
      .eq("id", planId);
    setGuardando(false);
    setFalló(!!error);
    // Lo que no se pudo guardar vuelve a la cola, o el coach pierde media
    // hora de trabajo sin enterarse.
    if (error) pendiente.current ??= cambio;
  }, [planId]);

  // Mismo motivo que en la carga de pesos: si la pestaña se oculta antes de
  // que venza el retardo, se guarda en el acto.
  useEffect(() => {
    const alOcultarse = () => { if (document.hidden) void vaciar(); };
    document.addEventListener("visibilitychange", alOcultarse);
    window.addEventListener("pagehide", vaciar);
    return () => {
      document.removeEventListener("visibilitychange", alOcultarse);
      window.removeEventListener("pagehide", vaciar);
      void vaciar();
    };
  }, [vaciar]);

  const aplicar = useCallback((nuevos: Dia[]) => {
    onCambio(nuevos);
    pendiente.current = nuevos;
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => void vaciar(), RETARDO);
  }, [onCambio, vaciar]);

  /** Cambia un ejercicio sin mutar nada: React necesita objetos nuevos para
   *  darse cuenta de que algo cambió. */
  const editarEjercicio = useCallback(
    (bi: number, ei: number, cambio: Partial<Ejercicio>) => {
      aplicar(dias.map((d, di) => di !== diaActivo ? d : {
        ...d,
        bloques: d.bloques.map((b, bj) => bj !== bi ? b : {
          ...b,
          ejercicios: b.ejercicios.map((e, ej) => ej !== ei ? e : { ...e, ...cambio }),
        }),
      }));
    },
    [aplicar, dias, diaActivo],
  );

  const editarBloque = useCallback(
    (bi: number, cambio: Partial<Bloque>) => {
      aplicar(dias.map((d, di) => di !== diaActivo ? d : {
        ...d,
        bloques: d.bloques.map((b, bj) => bj !== bi ? b : { ...b, ...cambio }),
      }));
    },
    [aplicar, dias, diaActivo],
  );

  const agregarEjercicio = useCallback((bi: number, base?: Partial<Ejercicio>) => {
    aplicar(dias.map((d, di) => di !== diaActivo ? d : {
      ...d,
      bloques: d.bloques.map((b, bj) => bj !== bi ? b : {
        ...b,
        ejercicios: [...b.ejercicios, { ...ejercicioVacio(semanas), ...base }],
      }),
    }));
  }, [aplicar, dias, diaActivo, semanas]);

  const borrarEjercicio = useCallback((bi: number, ei: number) => {
    aplicar(dias.map((d, di) => di !== diaActivo ? d : {
      ...d,
      bloques: d.bloques.map((b, bj) => bj !== bi ? b : {
        ...b,
        ejercicios: b.ejercicios.filter((_, ej) => ej !== ei),
      }),
    }));
  }, [aplicar, dias, diaActivo]);

  /** Mueve un ejercicio dentro de su bloque.
   *
   * Ojo: los registros del alumno están indexados por posición, así que mover
   * un ejercicio le mueve los pesos con él. Se avisa antes de hacerlo. */
  const moverEjercicio = useCallback((bi: number, ei: number, hacia: -1 | 1) => {
    const destino = ei + hacia;
    aplicar(dias.map((d, di) => di !== diaActivo ? d : {
      ...d,
      bloques: d.bloques.map((b, bj) => {
        if (bj !== bi || destino < 0 || destino >= b.ejercicios.length) return b;
        const lista = [...b.ejercicios];
        [lista[ei], lista[destino]] = [lista[destino], lista[ei]];
        return { ...b, ejercicios: lista };
      }),
    }));
  }, [aplicar, dias, diaActivo]);

  const agregarBloque = useCallback(() => {
    aplicar(dias.map((d, di) => di !== diaActivo ? d : {
      ...d, bloques: [...d.bloques, bloqueFuerza()],
    }));
  }, [aplicar, dias, diaActivo]);

  const borrarBloque = useCallback((bi: number) => {
    aplicar(dias.map((d, di) => di !== diaActivo ? d : {
      ...d, bloques: d.bloques.filter((_, bj) => bj !== bi),
    }));
  }, [aplicar, dias, diaActivo]);

  const agregarDia = useCallback(() => {
    aplicar([...dias, diaVacio(dias.length + 1)]);
  }, [aplicar, dias]);

  const borrarDia = useCallback(() => {
    aplicar(dias.filter((_, di) => di !== diaActivo));
  }, [aplicar, dias, diaActivo]);

  const dia = dias[diaActivo];
  if (!dia) return null;

  return (
    <div className={estilos.editor}>
      <div className={estilos.barra}>
        <span className={estilos.rotulo}>Editando</span>
        <span className={estilos.estado}>
          {falló ? "No se pudo guardar" : guardando ? "Guardando…" : "Se guarda solo"}
        </span>
      </div>

      <label className={estilos.campoLinea}>
        <span className={estilos.etiqueta}>Nombre del día</span>
        <input
          value={dia.nombre}
          maxLength={40}
          onChange={(e) => aplicar(dias.map((d, di) =>
            di !== diaActivo ? d : { ...d, nombre: e.target.value }))}
        />
      </label>

      <label className={estilos.campoLinea}>
        <span className={estilos.etiqueta}>Subtítulo</span>
        <input
          value={dia.sub ?? ""}
          maxLength={40}
          placeholder="Full body, Torso, Piernas…"
          onChange={(e) => aplicar(dias.map((d, di) =>
            di !== diaActivo ? d : { ...d, sub: e.target.value }))}
        />
      </label>

      {dia.bloques.map((bloque, bi) => (
        <section key={bi} className={estilos.bloque}>
          <div className={estilos.bloqueCabecera}>
            <input
              className={estilos.bloqueTitulo}
              value={bloque.titulo}
              maxLength={40}
              onChange={(e) => editarBloque(bi, { titulo: e.target.value })}
            />
            <button
              type="button"
              className={estilos.borrar}
              onClick={() => {
                if (confirm(`¿Borrar el bloque "${bloque.titulo}" y sus ${bloque.ejercicios.length} ejercicios?`)) {
                  borrarBloque(bi);
                }
              }}
              aria-label={`Borrar el bloque ${bloque.titulo}`}
            >
              Borrar bloque
            </button>
          </div>

          <label className={estilos.campoLinea}>
            <span className={estilos.etiqueta}>Nota</span>
            <input
              value={bloque.meta ?? ""}
              maxLength={80}
              placeholder="3 series del circuito · sin pausa"
              onChange={(e) => editarBloque(bi, { meta: e.target.value })}
            />
          </label>

          <label className={estilos.campoLinea}>
            <span className={estilos.etiqueta}>Descanso</span>
            <input
              value={String(bloque.descanso ?? "")}
              maxLength={12}
              placeholder="2:00, 90 seg, 2'…"
              onChange={(e) => editarBloque(bi, { descanso: e.target.value })}
            />
          </label>

          {bloque.ejercicios.map((ej, ei) => (
            <div key={ei} className={estilos.ejercicio}>
              <div className={estilos.filaNombre}>
                <input
                  className={estilos.nombre}
                  value={ej.nombre}
                  list="biblioteca-ejercicios"
                  onChange={(e) => {
                    const elegido = biblioteca.find((b) => b.nombre === e.target.value);
                    // Al elegir uno de la biblioteca se traen su video y su
                    // tipo de carga: escribirlos de nuevo a mano en cada
                    // mesociclo es donde aparecen los errores.
                    editarEjercicio(bi, ei, elegido
                      ? {
                          nombre: elegido.nombre,
                          video: elegido.video ?? "",
                          carga: elegido.carga as TipoCarga,
                        }
                      : { nombre: e.target.value });
                  }}
                />
                <div className={estilos.mover}>
                  <button type="button" onClick={() => moverEjercicio(bi, ei, -1)}
                          disabled={ei === 0} aria-label="Subir">↑</button>
                  <button type="button" onClick={() => moverEjercicio(bi, ei, 1)}
                          disabled={ei === bloque.ejercicios.length - 1} aria-label="Bajar">↓</button>
                </div>
              </div>

              <div className={estilos.filaCampos}>
                <label>
                  <span className={estilos.etiqueta}>Carga</span>
                  <select
                    value={ej.carga ?? "kg"}
                    onChange={(e) => editarEjercicio(bi, ei, { carga: e.target.value as TipoCarga })}
                  >
                    {(Object.keys(CARGAS) as TipoCarga[]).map((c) => (
                      <option key={c} value={c}>
                        {c === "kg" ? "Kilos" : c === "corporal" ? "Corporal" : "Banda"}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={estilos.crecer}>
                  <span className={estilos.etiqueta}>Video</span>
                  <input
                    value={ej.video ?? ""}
                    inputMode="url"
                    placeholder="https://youtube.com/…"
                    onChange={(e) => editarEjercicio(bi, ei, { video: e.target.value })}
                  />
                </label>
              </div>

              <div className={estilos.reps}>
                <span className={estilos.etiqueta}>
                  Reps por semana · &ldquo;8x3&rdquo; son 8 repeticiones por 3 series
                </span>
                <div className={estilos.repsFila}>
                  {Array.from({ length: semanas }, (_, s) => (
                    <label key={s} className={estilos.repsCampo}>
                      <span>S{s + 1}</span>
                      <input
                        value={ej.reps?.[s] ?? ""}
                        maxLength={16}
                        onChange={(e) => {
                          const reps = Array.from({ length: semanas },
                            (_, k) => ej.reps?.[k] ?? "");
                          reps[s] = e.target.value;
                          editarEjercicio(bi, ei, { reps });
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className={estilos.ejercicioPie}>
                <label className={estilos.unido}>
                  <input
                    type="checkbox"
                    checked={!!ej.unido}
                    disabled={ei === 0}
                    onChange={(e) => editarEjercicio(bi, ei, { unido: e.target.checked })}
                  />
                  Va unido al anterior (superserie)
                </label>
                <button
                  type="button"
                  className={estilos.borrar}
                  onClick={() => {
                    if (confirm(`¿Borrar "${ej.nombre}"? Los pesos que haya cargado el alumno en este lugar se van a ver corridos.`)) {
                      borrarEjercicio(bi, ei);
                    }
                  }}
                >
                  Borrar
                </button>
              </div>
            </div>
          ))}

          <button type="button" className={estilos.agregar}
                  onClick={() => agregarEjercicio(bi)}>
            + Ejercicio
          </button>
        </section>
      ))}

      <div className={estilos.acciones}>
        <button type="button" className={estilos.agregar} onClick={agregarBloque}>
          + Bloque
        </button>
        <button type="button" className={estilos.agregar} onClick={agregarDia}>
          + Día
        </button>
        {dias.length > 1 && (
          <button
            type="button"
            className={estilos.borrar}
            onClick={() => {
              if (confirm(`¿Borrar "${dia.nombre}" entero?`)) borrarDia();
            }}
          >
            Borrar este día
          </button>
        )}
      </div>

      <datalist id="biblioteca-ejercicios">
        {biblioteca.map((b) => <option key={b.nombre} value={b.nombre} />)}
      </datalist>
    </div>
  );
}
