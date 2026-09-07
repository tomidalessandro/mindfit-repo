import type { Metadata } from "next";
import Link from "next/link";

import { GUIA } from "@/lib/guia";

import estilos from "./guia.module.css";

export const metadata: Metadata = {
  title: "¿Cómo progresar? · MindFit",
};

export default function PaginaGuia() {
  return (
    <main className={estilos.pantalla}>
      <Link href="/" className={estilos.volver}>
        ‹ Volver
      </Link>

      <header className={estilos.cabecera}>
        <p className={estilos.rotulo}>{GUIA.rotulo}</p>
        <h1 className={estilos.titulo}>{GUIA.titulo}</h1>
        <p className={estilos.intro}>{GUIA.intro}</p>
      </header>

      <ol className={estilos.pasos}>
        {GUIA.pasos.map((paso, i) => (
          <li key={i} className={estilos.paso}>
            <span className={estilos.numero} aria-hidden="true">
              {i + 1}
            </span>
            <p>{paso}</p>
          </li>
        ))}
      </ol>

      <section className={estilos.ejemplo}>
        <h2 className={estilos.subtitulo}>El ciclo, en números</h2>
        {/* Envuelta en su propio scroll: en un teléfono angosto la tabla no
            tiene que empujar la página entera hacia el costado. */}
        <div className={estilos.tablaScroll}>
          <table className={estilos.tabla}>
            <thead>
              <tr>
                <th scope="col">Semana</th>
                <th scope="col">Carga</th>
                <th scope="col">Reps</th>
              </tr>
            </thead>
            <tbody>
              {GUIA.ejemplo.map((f) => (
                <tr key={f.semana}>
                  <th scope="row" className={estilos.semana}>{f.semana}</th>
                  <td>{f.carga}</td>
                  <td className={estilos.reps}>{f.reps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={estilos.cierre}>
        {GUIA.cierre.map((c) => (
          <div key={c.t} className={estilos.tarjeta}>
            <h3 className={estilos.tarjetaTitulo}>{c.t}</h3>
            <p className={estilos.tarjetaTexto}>{c.d}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
