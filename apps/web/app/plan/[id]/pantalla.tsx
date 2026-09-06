"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CARGAS, COLORES_BANDA, agruparEjercicios, claveSerie, hermanas, modoDe,
  seriesDe, tipoCarga, type Dia,
} from "@/lib/modelo";
import { clienteNavegador } from "@/lib/supabase/navegador";

import estilos from "./plan.module.css";

type Registro = {
  dia: number; bloque: number; ejercicio: number; semana: number; serie: number;
  carga: string | null; reps: string | null; hecha: boolean; heredada: boolean;
};

type SerieDePlan = {
  dia: number; bloque: number; ejercicio: number; semana: number; series: number;
};

type Plan = {
  id: string; titulo: string; semanas: number; alumnoId: string;
  cicloCarga: number[][]; dias: Dia[];
};

/** Cuánto se espera antes de guardar.
 *
 * Medio segundo: suficiente para no escribir en cada tecla, poco como para
 * que nadie llegue a irse de la pantalla. Y aun así se vacía la cola al
 * ocultarse la página — ver el efecto de más abajo. */
const RETARDO = 500;

export function PantallaPlan({
  plan, registros: iniciales, series: seriesIniciales, soyElAlumno,
}: {
  plan: Plan;
  registros: Registro[];
  series: SerieDePlan[];
  soyElAlumno: boolean;
}) {
  const [dia, setDia] = useState(0);
  const [semana, setSemana] = useState(0);

  const [registros, setRegistros] = useState(() => {
    const m = new Map<string, Registro>();
    for (const r of iniciales) {
      m.set(claveSerie(r.dia, r.bloque, r.ejercicio, r.semana, r.serie), r);
    }
    return m;
  });

  const seriesExtra = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of seriesIniciales) {
      m.set(`${s.dia}|${s.bloque}|${s.ejercicio}|${s.semana}`, s.series);
    }
    return m;
  }, [seriesIniciales]);

  // La cola de lo que falta guardar, indexada por serie: si alguien escribe
  // tres veces en el mismo casillero, se manda una sola fila, la última.
  const cola = useRef(new Map<string, Registro>());
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [falló, setFalló] = useState(false);

  const vaciar = useCallback(async () => {
    if (reloj.current) { clearTimeout(reloj.current); reloj.current = null; }
    if (cola.current.size === 0) return;

    const filas = [...cola.current.values()];
    cola.current.clear();
    setGuardando(true);

    const { error } = await clienteNavegador()
      .from("registros")
      .upsert(
        filas.map((r) => ({ plan_id: plan.id, alumno_id: plan.alumnoId, ...r })),
        { onConflict: "plan_id,dia,bloque,ejercicio,semana,serie" },
      );

    setGuardando(false);
    setFalló(!!error);
    // Lo que no se pudo guardar vuelve a la cola: sin esto, un corte de señal
    // en el gimnasio se lleva el peso sin que nadie se entere.
    if (error) filas.forEach((r) => {
      const k = claveSerie(r.dia, r.bloque, r.ejercicio, r.semana, r.serie);
      if (!cola.current.has(k)) cola.current.set(k, r);
    });
  }, [plan.id, plan.alumnoId]);

  /* Este efecto existe por un bug que ya pasó en la v2 y costaba un peso
     perdido por serie: el alumno carga el kilaje y bloquea el celular antes
     de que venza el retardo. Al ocultarse la página se guarda en el acto.
     `visibilitychange` y no `beforeunload`, que en iOS no dispara. */
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

  const encolar = useCallback((filas: Registro[]) => {
    setRegistros((antes) => {
      const m = new Map(antes);
      for (const r of filas) {
        m.set(claveSerie(r.dia, r.bloque, r.ejercicio, r.semana, r.serie), r);
      }
      return m;
    });
    for (const r of filas) {
      cola.current.set(claveSerie(r.dia, r.bloque, r.ejercicio, r.semana, r.serie), r);
    }
    if (reloj.current) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => void vaciar(), RETARDO);
  }, [vaciar]);

  const leer = useCallback(
    (b: number, e: number, s: number, serie: number): Registro =>
      registros.get(claveSerie(dia, b, e, s, serie)) ?? {
        dia, bloque: b, ejercicio: e, semana: s, serie,
        carga: null, reps: null, hecha: false, heredada: false,
      },
    [registros, dia],
  );

  /** El kilo de una serie se copia a la misma serie de las semanas hermanas,
   *  salvo que ahí ya lo hayan cargado a mano. */
  const guardarCarga = useCallback(
    (bi: number, ei: number, serie: number, valor: string) => {
      const bloque = plan.dias[dia].bloques[bi];
      const ej = bloque.ejercicios[ei];
      const propio = leer(bi, ei, semana, serie);
      const filas: Registro[] = [
        { ...propio, carga: valor || null, heredada: false },
      ];

      for (const w of hermanas(modoDe(bloque, ej), semana, plan.semanas, plan.cicloCarga)) {
        if (w === semana) continue;
        const otra = registros.get(claveSerie(dia, bi, ei, w, serie));
        // Un peso puesto a mano en otra semana no se pisa.
        if (otra?.carga && !otra.heredada) continue;
        filas.push({
          dia, bloque: bi, ejercicio: ei, semana: w, serie,
          carga: valor || null, reps: otra?.reps ?? null,
          hecha: otra?.hecha ?? false, heredada: !!valor,
        });
      }
      encolar(filas);
    },
    [plan, dia, semana, registros, leer, encolar],
  );

  const diaActual = plan.dias[dia];
  if (!diaActual) return <p className={estilos.vacio}>Este mesociclo no tiene días cargados.</p>;

  return (
    <main className={estilos.pantalla}>
      <nav className={estilos.dias} aria-label="Días">
        {plan.dias.map((d, i) => (
          <button key={i} type="button" className={estilos.diaTab}
                  aria-current={i === dia ? "true" : undefined}
                  onClick={() => setDia(i)}>
            {d.nombre}
          </button>
        ))}
      </nav>

      <header className={estilos.cabecera}>
        <p className={estilos.eyebrow}>
          {plan.titulo}{diaActual.sub ? ` · ${diaActual.sub}` : ""}
        </p>
        <div className={estilos.tituloFila}>
          <h1 className={estilos.titulo}>{diaActual.nombre}</h1>
          <span className={estilos.num}>{diaActual.num}</span>
        </div>
      </header>

      <div className={estilos.semanas}>
        <span className={estilos.semanasLabel}>Semana</span>
        <div className={estilos.semanasTabs}>
          {Array.from({ length: plan.semanas }, (_, s) => (
            <button key={s} type="button" className={estilos.semanaTab}
                    aria-current={s === semana ? "true" : undefined}
                    onClick={() => setSemana(s)}>
              S{s + 1}
            </button>
          ))}
        </div>
      </div>

      <datalist id="colores-banda">
        {COLORES_BANDA.map((c) => <option key={c} value={c} />)}
      </datalist>

      {diaActual.bloques.map((bloque, bi) => (
        <section key={bi} className={estilos.bloque}>
          <h2 className={estilos.bloqueTitulo}>{bloque.titulo}</h2>
          {bloque.meta && <p className={estilos.bloqueMeta}>{bloque.meta}</p>}

          {agruparEjercicios(bloque).map((grupo) =>
            grupo.items.map(({ ej, ei, etiqueta }) => {
              const info = seriesDe(ej, bloque, semana);
              const n = seriesExtra.get(`${dia}|${bi}|${ei}|${semana}`) ?? info.n;
              const tipo = tipoCarga(ej);
              const cfg = CARGAS[tipo];

              return (
                <article key={ei} className={estilos.ejercicio}>
                  <div className={estilos.ejercicioCabecera}>
                    <span className={estilos.letra}>{etiqueta}</span>
                    {ej.video ? (
                      <a className={estilos.nombre} href={ej.video}
                         target="_blank" rel="noopener noreferrer">{ej.nombre}</a>
                    ) : (
                      <span className={estilos.nombre}>{ej.nombre}</span>
                    )}
                  </div>

                  <div className={estilos.series}>
                    {Array.from({ length: n }, (_, i) => i + 1).map((serie) => {
                      const r = leer(bi, ei, semana, serie);
                      return (
                        <div key={serie}
                             className={`${estilos.serie} ${r.hecha ? estilos.hecha : ""}`}>
                          <span className={estilos.serieN}>{serie}</span>

                          <label className={estilos.campo}>
                            <span className="sr-only">
                              {cfg.col} de la serie {serie} de {ej.nombre}
                            </span>
                            <input
                              value={r.carga ?? ""}
                              placeholder={cfg.hint}
                              inputMode={tipo === "banda" ? "text" : "decimal"}
                              list={tipo === "banda" ? "colores-banda" : undefined}
                              // Gris cuando el peso vino propagado de otra
                              // semana y no lo cargó el alumno.
                              style={r.heredada ? { color: "var(--muted)" } : undefined}
                              onChange={(e) => guardarCarga(bi, ei, serie, e.target.value)}
                            />
                            {cfg.unidad && <span className={estilos.unidad}>{cfg.unidad}</span>}
                          </label>

                          <span className={estilos.por}>×</span>

                          <label className={`${estilos.campo} ${estilos.campoReps}`}>
                            <span className="sr-only">
                              Repeticiones de la serie {serie} de {ej.nombre}
                            </span>
                            <input
                              value={r.reps ?? ""}
                              placeholder={info.objetivo}
                              inputMode={/^\d+$/.test(info.objetivo) ? "numeric" : "text"}
                              onChange={(e) =>
                                encolar([{ ...r, reps: e.target.value || null }])
                              }
                            />
                          </label>

                          <button
                            type="button"
                            className={estilos.ok}
                            aria-pressed={r.hecha}
                            aria-label={`Marcar la serie ${serie} de ${ej.nombre} como hecha`}
                            onClick={() =>
                              encolar([{
                                ...r,
                                hecha: !r.hecha,
                                // Si no escribió las reps, se dan por hechas
                                // las que pedía el plan.
                                reps: !r.hecha && !r.reps && info.objetivo
                                  ? info.objetivo : r.reps,
                              }])
                            }
                          >
                            ✓
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            }),
          )}
        </section>
      ))}

      <p className={estilos.estado} role="status">
        {falló
          ? "Sin conexión. Lo guardado queda acá y sube solo cuando vuelva."
          : guardando
            ? "Guardando…"
            : soyElAlumno
              ? "Se guarda solo"
              : "Estás viendo la rutina de tu alumno"}
      </p>
    </main>
  );
}
