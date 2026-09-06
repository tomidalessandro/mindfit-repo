import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./tipos";

/** El cliente para Server Components y Route Handlers.
 *
 * Lee la sesión de las cookies, así que las consultas salen con el JWT del
 * usuario y RLS aplica igual que en el navegador. Nunca usa la service key:
 * el frontend no tiene por qué poder ver los datos de todos. */
export async function clienteServidor() {
  const almacen = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (nuevas) => {
          try {
            nuevas.forEach(({ name, value, options }) =>
              almacen.set(name, value, options),
            );
          } catch {
            // Desde un Server Component no se pueden escribir cookies. No es
            // un problema: el middleware ya refrescó la sesión antes de llegar
            // acá.
          }
        },
      },
    },
  );
}
