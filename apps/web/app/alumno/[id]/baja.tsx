"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import estilos from "./alumno.module.css";

/** Dar de baja a un alumno, o volver a darle el alta.
 *
 * La palabra es "dar de baja" y no "borrar" en toda la pantalla, porque es lo
 * que realmente pasa: no se pierde nada. Decir "borrar" y no borrar es peor
 * que cualquiera de las dos cosas por separado.
 */
export function Baja({
  alumnoId,
  nombre,
  archivado,
  planes,
}: {
  alumnoId: string;
  nombre: string;
  archivado: boolean;
  planes: number;
}) {
  const router = useRouter();
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  async function cambiar(dar_baja: boolean) {
    setTrabajando(true);
    setError(null);
    const r = await fetch(`/api/alumnos/${alumnoId}/baja`, {
      method: dar_baja ? "POST" : "DELETE",
    });
    setTrabajando(false);
    setConfirmando(false);

    if (!r.ok) {
      setError(dar_baja ? "No se pudo dar de baja." : "No se pudo reactivar.");
      return;
    }
    router.refresh();
  }

  if (archivado) {
    return (
      <div className={estilos.bajaCaja}>
        <p className={estilos.bajaTexto}>
          <strong>{nombre} está dado de baja.</strong> No puede entrar a la app,
          pero {planes === 0 ? "no perdió nada" : planes === 1
            ? "su mesociclo y sus pesos siguen guardados"
            : `sus ${planes} mesociclos y sus pesos siguen guardados`}.
        </p>
        <button
          type="button"
          className={estilos.botonPrimario}
          disabled={trabajando}
          onClick={() => cambiar(false)}
        >
          {trabajando ? "Reactivando…" : "Volver a darle el alta"}
        </button>
        {error && <p className={estilos.error} role="alert">{error}</p>}
      </div>
    );
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        className={estilos.bajaEnlace}
        onClick={() => setConfirmando(true)}
      >
        Dar de baja a {nombre}
      </button>
    );
  }

  return (
    <div className={estilos.bajaCaja}>
      <p className={estilos.bajaTexto}>
        <strong>¿Dar de baja a {nombre}?</strong> Deja de aparecer en tu lista y
        no va a poder entrar con su contraseña.{" "}
        {planes > 0 && `Sus ${planes === 1 ? "datos" : "datos"} no se borran: `}
        se puede reactivar cuando quieras y vuelve con todo lo que tenía.
      </p>
      <div className={estilos.acciones}>
        <button
          type="button"
          className={estilos.botonPeligro}
          disabled={trabajando}
          onClick={() => cambiar(true)}
        >
          {trabajando ? "Dando de baja…" : "Sí, dar de baja"}
        </button>
        <button
          type="button"
          className={estilos.botonSecundario}
          disabled={trabajando}
          onClick={() => setConfirmando(false)}
        >
          Cancelar
        </button>
      </div>
      {error && <p className={estilos.error} role="alert">{error}</p>}
    </div>
  );
}
