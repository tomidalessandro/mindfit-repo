"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { clienteNavegador } from "@/lib/supabase/navegador";

import estilos from "./entrar.module.css";

type Estado =
  | { paso: "pidiendo" }
  | { paso: "enviando" }
  | { paso: "enviado"; email: string }
  | { paso: "error"; mensaje: string };

/** Traduce el error de Supabase a algo que sirva para actuar.
 *
 * El genérico "probá de nuevo en un momento" es peor que no decir nada
 * cuando el problema es el límite de mails: ahí el momento es una hora, y
 * quien lo lee se queda recargando al pedo. */
function explicar(error: { message: string; status?: number }): string {
  const msg = error.message.toLowerCase();

  if (error.status === 429 || msg.includes("rate limit")) {
    return "Se alcanzó el límite de mails por hora del servidor de prueba. " +
      "Esperá un rato, o pedile a quien administra la app que configure un " +
      "proveedor de mail propio.";
  }
  if (error.status === 422 || msg.includes("signups not allowed")) {
    return "Ese mail no está dado de alta. Pedile a tu coach que te invite.";
  }
  if (msg.includes("invalid") && msg.includes("email")) {
    return "Ese mail no parece válido. Fijate si tiene algún error de tipeo.";
  }
  return "No se pudo mandar el mail. Si sigue pasando, avisale a tu coach.";
}

export function FormularioEntrar() {
  const [estado, setEstado] = useState<Estado>({ paso: "pidiendo" });
  const parametros = useSearchParams();
  const volver = parametros.get("volver") ?? "/";

  async function enviar(datos: FormData) {
    const email = String(datos.get("email") ?? "").trim().toLowerCase();
    if (!email) return;

    setEstado({ paso: "enviando" });
    const supabase = clienteNavegador();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Nadie se da de alta solo: los alumnos los invita el coach. Sin esto,
        // cualquiera con el link de la app se crearía una cuenta.
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/confirmar?volver=${encodeURIComponent(volver)}`,
      },
    });

    if (error) {
      setEstado({ paso: "error", mensaje: explicar(error) });
      return;
    }
    setEstado({ paso: "enviado", email });
  }

  if (estado.paso === "enviado") {
    return (
      <div className={estilos.aviso} role="status">
        <p>
          Te mandamos un link a <strong>{estado.email}</strong>.
        </p>
        <p className={estilos.chico}>
          Abrilo desde este mismo teléfono. Vence en una hora.
        </p>
      </div>
    );
  }

  return (
    <form action={enviar} className={estilos.form}>
      <label className={estilos.etiqueta} htmlFor="email">
        Tu mail
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        placeholder="vos@ejemplo.com"
        className={estilos.campo}
        disabled={estado.paso === "enviando"}
      />
      <button
        type="submit"
        className={estilos.boton}
        disabled={estado.paso === "enviando"}
      >
        {estado.paso === "enviando" ? "Mandando…" : "Mandame el link"}
      </button>

      {estado.paso === "error" && (
        <p className={estilos.error} role="alert">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
