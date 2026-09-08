"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CARGAS, COLORES_BANDA, agruparEjercicios, claveSerie, descansoDe, hermanas,
  modoDe, nombreGrupo, seriesDe, tipoCarga, type Dia,
} from "@/lib/modelo";
import { useBandera } from "@/lib/preferencias";
import { clienteNavegador } from "@/lib/supabase/navegador";

import { Cronometro, type Descanso } from "./cronometro";
import { Editor } from "./editor";
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
  plan, registros: iniciales, series: seriesIniciales, soyElAlumno, soyElCoach,
  biblioteca,
}: {
  plan: Plan;
  registros: Registro[];
  series: SerieDePlan[];
  soyElAlumno: boolean;
  soyElCoach: boolean;
  biblioteca: { nombre: string; video: string | null; carga: string }[];
}) {
  // La estructura vive en estado porque el coach la edita en la misma
  // pantalla: al agregar un ejercicio tiene que verlo aparecer, no recargar.
  const [dias, setDias] = useState(plan.dias);
  const [editando, setEditando] = useState(false);
  const [dia, setDia] = useState(0);
  const [semana, setSemana] = useState(0);

  const [descanso, setDescanso] = useState<Descanso | null>(null);
  const [cronoOn, setCronoOn] = useBandera("mf:crono");
  // iOS solo deja crear un AudioContext dentro de un gesto del usuario, así
  // que se arma en el clic que marca la serie. Para cuando termina la pausa
  // ya no hay gesto al que colgarse.
  const audio = useRef<AudioContext | null>(null);

  const cambiarCrono = useCallback((valor: boolean) => {
    setCronoOn(valor);
    if (!valor) setDescanso(null);
  }, [setCronoOn]);

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
      const bloque = dias[dia].bloques[bi];
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
    [dias, plan.semanas, plan.cicloCarga, dia, semana, registros, leer, encolar],
  );

  const diaActual = dias[dia];
  if (!diaActual) return <p className={estilos.vacio}>Este mesociclo no tiene días cargados.</p>;

  return (
    <main className={`${estilos.pantalla} ${descanso ? estilos.conCrono : ""}`}>
      {/* El coach llega acá desde la ficha de su alumno y el alumno desde su
          lista: cada uno vuelve a donde estaba. Sin esto la pantalla del plan
          es un pozo, y en el celular no hay barra de navegación que ayude. */}
      <div className={estilos.encabezado}>
        <Link
          href={soyElAlumno ? "/" : `/alumno/${plan.alumnoId}`}
          className={estilos.volver}
        >
          ‹ Volver
        </Link>

        {soyElCoach && (
          <button
            type="button"
            className={estilos.modo}
            aria-pressed={editando}
            onClick={() => setEditando((v) => !v)}
          >
            {editando ? "Listo" : "Editar"}
          </button>
        )}
      </div>

      <nav className={estilos.dias} aria-label="Días">
        {dias.map((d, i) => (
          <button key={i} type="button" className={estilos.diaTab}
                  aria-current={i === dia ? "true" : undefined}
                  onClick={() => setDia(i)}>
            {d.nombre}
          </button>
        ))}
        {/* La guía va acá, entre los días, igual que en la v2: es donde surge
            la duda de cuánto peso poner. */}
        <Link href="/guia" className={estilos.diaTab}>
          Guía
        </Link>
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

      {editando ? (
        <Editor
          planId={plan.id}
          dias={dias}
          semanas={plan.semanas}
          diaActivo={dia}
          biblioteca={biblioteca}
          onCambio={(nuevos) => {
            setDias(nuevos);
            // Si borró el día que estaba abierto, hay que moverse a uno que
            // exista o la pantalla queda en blanco.
            if (dia >= nuevos.length) setDia(Math.max(0, nuevos.length - 1));
          }}
        />
      ) : diaActual.bloques.map((bloque, bi) => (
        <section key={bi} className={estilos.bloque}>
          <h2 className={estilos.bloqueTitulo}>{bloque.titulo}</h2>
          {bloque.meta && <p className={estilos.bloqueMeta}>{bloque.meta}</p>}

          {agruparEjercicios(bloque).map((grupo) => {
            // En una superserie la pausa va al cerrar la vuelta, y la define
            // el último ejercicio del grupo.
            const cierre = grupo.items[grupo.items.length - 1].ej;
            const etiquetaPausa = grupo.items.length > 1
              ? `Descanso · ${nombreGrupo(grupo.items.length)} ${grupo.letra}`
              : `Descanso · ${cierre.nombre}`;

            return grupo.items.map(({ ej, ei, etiqueta, ultimo }) => {
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
                      <span className={`${estilos.nombre} ${ej.nombre ? "" : estilos.sinNombre}`}>
                        {/* Sin nombre se ve incompleto y no invisible: el
                            coach tiene que darse cuenta de que le falta. */}
                        {ej.nombre || "Sin nombre"}
                      </span>
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
                            onClick={() => {
                              const marcando = !r.hecha;
                              encolar([{
                                ...r,
                                hecha: marcando,
                                // Si no escribió las reps, se dan por hechas
                                // las que pedía el plan.
                                reps: marcando && !r.reps && info.objetivo
                                  ? info.objetivo : r.reps,
                              }]);

                              // La pausa arranca solo al marcar, nunca al
                              // desmarcar: desmarcar es corregir un error, no
                              // terminar una serie. Y solo en el último
                              // ejercicio del grupo, porque en una superserie
                              // no se descansa entre A1 y A2.
                              if (!marcando || !cronoOn || !ultimo) return;
                              const segundos = descansoDe(bloque, cierre);
                              if (!segundos) return;

                              try {
                                audio.current ??= new AudioContext();
                              } catch {
                                // Sin sonido igual vibra y se ve.
                              }
                              setDescanso({
                                total: segundos,
                                etiqueta: etiquetaPausa,
                                desde: Date.now(),
                              });
                            }}
                          >
                            ✓
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
            });
          })}
        </section>
      ))}

      <div className={estilos.pie}>
        {soyElAlumno && (
          <label className={estilos.interruptor}>
            <input
              type="checkbox"
              checked={cronoOn}
              onChange={(e) => cambiarCrono(e.target.checked)}
            />
            Cronometrar los descansos
          </label>
        )}

        <p className={estilos.estado} role="status">
          {falló
            ? "Sin conexión. Lo guardado queda acá y sube solo cuando vuelva."
            : guardando
              ? "Guardando…"
              : soyElAlumno
                ? "Se guarda solo"
                : "Estás viendo la rutina de tu alumno"}
        </p>
      </div>

      {descanso && (
        <Cronometro
          // Remonta en cada serie: así el componente arranca limpio sin un
          // efecto que resetee su estado a mano.
          key={descanso.desde}
          descanso={descanso}
          audio={audio}
          onCerrar={() => setDescanso(null)}
        />
      )}
    </main>
  );
}
