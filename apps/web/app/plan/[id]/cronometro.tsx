"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { mmss } from "@/lib/modelo";

import estilos from "./cronometro.module.css";

export type Descanso = {
  /** Segundos que dura la pausa. */
  total: number;
  /** "Descanso · Sentadilla" o "Descanso · Superserie A". */
  etiqueta: string;
  /** Marca de tiempo en que arrancó. Cambia en cada serie, y es lo que hace
   *  que el componente se reinicie aunque la pausa dure lo mismo. */
  desde: number;
};

/** Dos pitidos cortos.
 *
 * En el gimnasio suena música fuerte, así que el aviso va también por
 * vibración. El AudioContext se pasa desde afuera porque iOS solo lo deja
 * arrancar dentro de un gesto del usuario, y el gesto es el clic que marcó la
 * serie — para cuando termina la pausa, ya es tarde para pedirlo. */
function avisar(audio: AudioContext | null) {
  try {
    if (audio) {
      if (audio.state === "suspended") void audio.resume();
      for (const t of [0, 0.18]) {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.frequency.value = 880;
        o.type = "sine";
        g.gain.setValueAtTime(0.0001, audio.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.14);
        o.connect(g);
        g.connect(audio.destination);
        o.start(audio.currentTime + t);
        o.stop(audio.currentTime + t + 0.16);
      }
    }
  } catch {
    // Sin sonido se sigue viendo el cartel y vibrando. No vale la pena
    // romper el descanso por esto.
  }
  try {
    navigator.vibrate?.([120, 80, 120]);
  } catch {
    /* Safari en iOS no la tiene. */
  }
}

export function Cronometro({
  descanso,
  audio,
  onCerrar,
}: {
  descanso: Descanso;
  /** El ref y no el valor: el AudioContext se crea en el clic que dispara la
   *  pausa, y leer `.current` durante el render sería mirar algo que React no
   *  garantiza estable. */
  audio: RefObject<AudioContext | null>;
  onCerrar: () => void;
}) {
  // Los segundos que se suman o restan con los botones. Se guarda aparte del
  // descanso para no tener que reconstruirlo entero en cada toque.
  //
  // No hace falta reiniciarlo cuando cambia el descanso: quien lo usa monta el
  // componente con `key={descanso.desde}`, así que en cada serie nace nuevo.
  const [ajuste, setAjuste] = useState(0);
  const [ahora, setAhora] = useState(() => Date.now());
  const yaAvisó = useRef(false);

  const fin = descanso.desde + (descanso.total + ajuste) * 1000;
  const queda = (fin - ahora) / 1000;
  const total = descanso.total + ajuste;

  useEffect(() => {
    // 250ms y no 1000: con un segundo justo, la cuenta se ve saltear números
    // cuando el navegador atrasa el temporizador.
    const t = setInterval(() => setAhora(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const terminó = queda <= 0;

  useEffect(() => {
    if (!terminó || yaAvisó.current) return;
    yaAvisó.current = true;
    avisar(audio.current);
    // Se queda unos segundos mostrando "terminado" y se va solo: en medio de
    // una serie nadie quiere buscar un botón para cerrarlo.
    const t = setTimeout(onCerrar, 4000);
    return () => clearTimeout(t);
  }, [terminó, audio, onCerrar]);

  return (
    <div
      className={`${estilos.crono} ${terminó ? estilos.fin : ""}`}
      role="timer"
      aria-live="off"
    >
      <div className={estilos.interior}>
        <div className={estilos.barra}>
          <i
            className={estilos.relleno}
            style={{ width: `${Math.max(0, Math.min(100, (queda / total) * 100))}%` }}
          />
        </div>

        <span className={estilos.etiqueta}>
          {terminó ? "Descanso terminado" : descanso.etiqueta}
        </span>

        <div className={estilos.fila}>
          <span className={estilos.tiempo}>{mmss(queda)}</span>
          <button
            type="button"
            className={estilos.boton}
            onClick={() => setAjuste((a) => a - 15)}
            aria-label="Quitar quince segundos"
          >
            −15
          </button>
          <button
            type="button"
            className={estilos.boton}
            onClick={() => setAjuste((a) => a + 15)}
            aria-label="Sumar quince segundos"
          >
            +15
          </button>
          <button type="button" className={estilos.boton} onClick={onCerrar}>
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}
