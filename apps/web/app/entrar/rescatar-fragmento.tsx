"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { clienteNavegador } from "@/lib/supabase/navegador";

import estilos from "./entrar.module.css";

/** Red de seguridad para los links mágicos del flujo implícito.
 *
 * La plantilla de mail por defecto de Supabase manda al usuario a
 * `/auth/v1/verify`, que devuelve la sesión en el FRAGMENTO de la URL
 * (`/#access_token=…`). Los fragmentos no viajan al servidor: el navegador no
 * los manda. Así que el proxy no ve sesión, rebota a /entrar, y el usuario
 * queda en un loop que no explica nada.
 *
 * Esto lo levanta desde el navegador, que sí lo ve, y lo convierte en una
 * sesión con cookies para que el servidor la encuentre en el próximo pedido.
 *
 * El arreglo de fondo es cambiar la plantilla del mail para que use
 * {{ .TokenHash }} y apunte derecho a /auth/confirmar: así el token nunca
 * pasa por el navegador, y además funciona si el mail se abre en otro
 * dispositivo, cosa que el flujo PKCE no puede. Mientras tanto, esto evita
 * que nadie quede afuera. */
export function RescatarFragmento() {
  const router = useRouter();
  const [falló, setFalló] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.hash.slice(1));
    const access_token = p.get("access_token");
    const refresh_token = p.get("refresh_token");
    if (!access_token || !refresh_token) return;

    void (async () => {
      const { error } = await clienteNavegador().auth.setSession({
        access_token,
        refresh_token,
      });

      // Sacar el token de la barra de direcciones apenas se usó: no tiene por
      // qué quedar en el historial ni en una captura de pantalla.
      window.history.replaceState(null, "", window.location.pathname);

      if (error) {
        setFalló(true);
        return;
      }
      router.replace("/");
      router.refresh();
    })();
  }, [router]);

  if (!falló) return null;

  return (
    <p className={estilos.error} role="alert">
      Ese link ya se usó o venció. Pedí uno nuevo.
    </p>
  );
}
