"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import estilos from "./inicio.module.css";

type Alta = { nombre: string; email: string; clave: string };

/** El alta de un alumno, para el coach.
 *
 * Al terminar muestra el mail y la contraseña una sola vez, con un botón para
 * copiar el mensaje armado. No se guardan en ningún lado y no hay forma de
 * volver a verlas: si se pierden, se genera otra.
 */
export function NuevoAlumno() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alta, setAlta] = useState<Alta | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function crear(datos: FormData) {
    const nombre = String(datos.get("nombre") ?? "").trim();
    if (!nombre) return;

    setGuardando(true);
    setError(null);

    const r = await fetch("/api/alumnos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre }),
    });
    setGuardando(false);

    if (!r.ok) {
      const { error: msg } = await r.json().catch(() => ({ error: null }));
      setError(msg ?? "No se pudo crear. Probá de nuevo.");
      return;
    }

    setAlta(await r.json());
    // La lista de alumnos la pinta el servidor: sin esto el alumno nuevo no
    // aparece hasta recargar a mano.
    router.refresh();
  }

  if (alta) {
    const mensaje =
      `Hola ${alta.nombre}, ya tenés tu rutina en MindFit.\n\n` +
      `Entrá en ${typeof window !== "undefined" ? window.location.origin : ""}\n` +
      `Usuario: ${alta.email}\n` +
      `Contraseña: ${alta.clave}\n\n` +
      `Guardala: por ahora no hay forma de recuperarla sola.`;

    return (
      <div className={estilos.altaLista}>
        <h2 className={estilos.altaTitulo}>{alta.nombre} ya puede entrar</h2>

        <dl className={estilos.credenciales}>
          <dt>Usuario</dt>
          <dd>{alta.email}</dd>
          <dt>Contraseña</dt>
          <dd>{alta.clave}</dd>
        </dl>

        <p className={estilos.aviso}>
          Copiala ahora: no se guarda en ningún lado y no se puede volver a
          ver. Si se pierde, se genera otra.
        </p>

        <div className={estilos.acciones}>
          <button
            type="button"
            className={estilos.botonPrimario}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(mensaje);
                setCopiado(true);
              } catch {
                // Sin permiso de portapapeles queda el texto a la vista para
                // copiarlo a mano.
                setCopiado(false);
              }
            }}
          >
            {copiado ? "Copiado ✓" : "Copiar el mensaje"}
          </button>
          <button
            type="button"
            className={estilos.botonSecundario}
            onClick={() => { setAlta(null); setAbierto(false); setCopiado(false); }}
          >
            Listo
          </button>
        </div>

        <textarea readOnly className={estilos.mensaje} value={mensaje} rows={7} />
      </div>
    );
  }

  if (!abierto) {
    return (
      <button type="button" className={estilos.botonPrimario}
              onClick={() => setAbierto(true)}>
        + Nuevo alumno
      </button>
    );
  }

  return (
    <form action={crear} className={estilos.formulario}>
      <label className={estilos.campoEtiqueta} htmlFor="nombre">
        Nombre del alumno
      </label>
      <input
        id="nombre"
        name="nombre"
        required
        autoFocus
        maxLength={60}
        placeholder="Karina"
        className={estilos.campo}
        disabled={guardando}
      />
      <p className={estilos.ayuda}>
        El usuario se arma solo con el nombre. No hace falta un mail de verdad:
        todavía no se manda nada por correo.
      </p>

      <div className={estilos.acciones}>
        <button type="submit" className={estilos.botonPrimario} disabled={guardando}>
          {guardando ? "Creando…" : "Crear"}
        </button>
        <button type="button" className={estilos.botonSecundario}
                onClick={() => setAbierto(false)} disabled={guardando}>
          Cancelar
        </button>
      </div>

      {error && <p className={estilos.error} role="alert">{error}</p>}
    </form>
  );
}
