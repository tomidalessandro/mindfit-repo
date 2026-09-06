"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { clienteNavegador } from "@/lib/supabase/navegador";

export function Salir() {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  return (
    <button
      type="button"
      className="salir"
      disabled={saliendo}
      onClick={async () => {
        setSaliendo(true);
        await clienteNavegador().auth.signOut();
        // refresh() y no push(): hay que revalidar los Server Components, o
        // la pantalla siguiente se pinta con los datos de la sesión vieja.
        router.refresh();
      }}
    >
      {saliendo ? "Saliendo…" : "Salir"}
    </button>
  );
}
