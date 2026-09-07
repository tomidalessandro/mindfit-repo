"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { cicloPorDefecto, planVacio } from "@/lib/plantillas";
import { clienteNavegador } from "@/lib/supabase/navegador";

import estilos from "./alumno.module.css";

/** El alta de un mesociclo.
 *
 * Pide lo mínimo —título, semanas y cuántos días— y crea el esqueleto: cada
 * día con su bloque de calentamiento y su bloque de fuerza, vacíos. Los
 * ejercicios se cargan después, en la pantalla del plan.
 *
 * Es a propósito que no pida más: un formulario largo antes de ver nada es la
 * forma más rápida de que el coach lo abandone a la mitad.
 */
export function NuevoMesociclo({
  alumnoId,
  coachId,
  nombreAlumno,
}: {
  alumnoId: string;
  coachId: string;
  nombreAlumno: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear(datos: FormData) {
    const titulo = String(datos.get("titulo") ?? "").trim();
    const semanas = Number(datos.get("semanas") ?? 4);
    const dias = Number(datos.get("dias") ?? 3);
    if (!titulo) return;

    setGuardando(true);
    setError(null);

    const { data, error: err } = await clienteNavegador()
      .from("planes")
      .insert({
        alumno_id: alumnoId,
        coach_id: coachId,
        titulo,
        semanas,
        ciclo_carga: cicloPorDefecto(semanas),
        estructura: planVacio(dias),
      })
      .select("id")
      .single();

    setGuardando(false);

    if (err || !data) {
      setError("No se pudo crear. Probá de nuevo.");
      return;
    }
    router.push(`/plan/${data.id}`);
  }

  if (!abierto) {
    return (
      <button
        type="button"
        className={estilos.botonPrimario}
        onClick={() => setAbierto(true)}
      >
        + Nuevo mesociclo
      </button>
    );
  }

  return (
    <form action={crear} className={estilos.formulario}>
      <h2 className={estilos.formTitulo}>Nuevo mesociclo para {nombreAlumno}</h2>

      <label className={estilos.campoEtiqueta} htmlFor="titulo">
        Título
      </label>
      <input
        id="titulo"
        name="titulo"
        required
        autoFocus
        maxLength={80}
        placeholder="Septiembre · Full body"
        className={estilos.campo}
        disabled={guardando}
      />

      <div className={estilos.dosColumnas}>
        <div>
          <label className={estilos.campoEtiqueta} htmlFor="semanas">
            Semanas
          </label>
          <select id="semanas" name="semanas" defaultValue={4}
                  className={estilos.campo} disabled={guardando}>
            {[3, 4, 5, 6, 8, 12].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={estilos.campoEtiqueta} htmlFor="dias">
            Días por semana
          </label>
          <select id="dias" name="dias" defaultValue={3}
                  className={estilos.campo} disabled={guardando}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      <p className={estilos.ayuda}>
        Con 4 semanas el ciclo de carga arranca en 3 de carga y 1 de descarga.
        Los ejercicios se cargan en la pantalla siguiente.
      </p>

      <div className={estilos.acciones}>
        <button type="submit" className={estilos.botonPrimario} disabled={guardando}>
          {guardando ? "Creando…" : "Crear"}
        </button>
        <button
          type="button"
          className={estilos.botonSecundario}
          onClick={() => setAbierto(false)}
          disabled={guardando}
        >
          Cancelar
        </button>
      </div>

      {error && <p className={estilos.error} role="alert">{error}</p>}
    </form>
  );
}
