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
      setEstado({
        paso: "error",
        mensaje:
          error.message.toLowerCase().includes("signups not allowed") ||
          error.status === 422
            ? "Ese mail no está dado de alta. Pedile a tu coach que te invite."
            : "No se pudo mandar el mail. Probá de nuevo en un momento.",
      });
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
