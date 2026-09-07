"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { clienteNavegador } from "@/lib/supabase/navegador";

import estilos from "./entrar.module.css";

type Estado =
  | { paso: "pidiendo" }
  | { paso: "entrando" }
  | { paso: "error"; mensaje: string };

/** Traduce el error de Supabase a algo que sirva para actuar.
 *
 * Un "algo salió mal" genérico deja a la persona recargando sin saber si se
 * equivocó de contraseña, de mail, o si el problema es del otro lado. */
function explicar(error: { message: string; status?: number }): string {
  const msg = error.message.toLowerCase();

  if (msg.includes("invalid login credentials")) {
    return "El mail o la contraseña no coinciden. Fijate que no haya quedado " +
      "una mayúscula del teclado del celular.";
  }
  if (error.status === 429 || msg.includes("rate limit")) {
    return "Demasiados intentos seguidos. Esperá un minuto y probá de nuevo.";
  }
  if (msg.includes("email not confirmed")) {
    return "Tu cuenta todavía no está habilitada. Avisale a tu coach.";
  }
  return "No se pudo entrar. Si sigue pasando, avisale a tu coach.";
}

export function FormularioEntrar() {
  const [estado, setEstado] = useState<Estado>({ paso: "pidiendo" });
  const router = useRouter();
  const parametros = useSearchParams();
  const volver = parametros.get("volver") ?? "/";

  async function entrar(datos: FormData) {
    const email = String(datos.get("email") ?? "").trim().toLowerCase();
    const password = String(datos.get("password") ?? "");
    if (!email || !password) return;

    setEstado({ paso: "entrando" });

    const { error } = await clienteNavegador().auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setEstado({ paso: "error", mensaje: explicar(error) });
      return;
    }

    // Solo rutas propias: `volver` sale de la URL y no hay que confiar en ella.
    const destino = volver.startsWith("/") && !volver.startsWith("//") ? volver : "/";
    router.replace(destino);
    // Los Server Components se pintaron sin sesión; sin esto queda la pantalla
    // de antes de entrar.
    router.refresh();
  }

  const ocupado = estado.paso === "entrando";

  return (
    <form action={entrar} className={estilos.form}>
      <label className={estilos.etiqueta} htmlFor="email">
        Tu mail
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        required
        placeholder="vos@ejemplo.com"
        className={estilos.campo}
        disabled={ocupado}
      />

      <label className={estilos.etiqueta} htmlFor="password">
        Tu contraseña
      </label>
      <input
        id="password"
        name="password"
        type="password"
        // `current-password` deja que el llavero del celular la guarde y la
        // complete sola la próxima vez. Sin esto hay que tipearla siempre.
        autoComplete="current-password"
        required
        className={estilos.campo}
        disabled={ocupado}
      />

      <button type="submit" className={estilos.boton} disabled={ocupado}>
        {ocupado ? "Entrando…" : "Entrar"}
      </button>

      {estado.paso === "error" && (
        <p className={estilos.error} role="alert">
          {estado.mensaje}
        </p>
      )}

      <p className={estilos.chico}>
        La contraseña te la da tu coach. Si te la olvidaste, pedísela: por ahora
        no hay recuperación por mail.
      </p>
    </form>
  );
}
