import type { NextRequest } from "next/server";

import { refrescarSesion } from "./lib/supabase/sesion";

/** Corre antes que cualquier página.
 *
 * Hace dos cosas: refresca el token de Supabase si venció —si no, la sesión
 * se corta sola a la hora— y saca a la calle a quien no tiene sesión. En
 * Next 16 esto se llama `proxy`; era `middleware` hasta la 15. */
export async function proxy(pedido: NextRequest) {
  return refrescarSesion(pedido);
}

export const config = {
  matcher: [
    // Todo menos los archivos estáticos y las imágenes.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)",
  ],
};
