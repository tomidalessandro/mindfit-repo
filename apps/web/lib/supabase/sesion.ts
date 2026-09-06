import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./tipos";

/** Rutas que se pueden abrir sin sesión. Todo lo demás manda a /entrar. */
const PUBLICAS = ["/entrar", "/auth"];

export async function refrescarSesion(pedido: NextRequest) {
  let respuesta = NextResponse.next({ request: pedido });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => pedido.cookies.getAll(),
        setAll: (nuevas) => {
          nuevas.forEach(({ name, value }) => pedido.cookies.set(name, value));
          respuesta = NextResponse.next({ request: pedido });
          nuevas.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() y no getSession(): este valida el token contra Supabase en vez
  // de confiar en lo que dice la cookie. Entre medio refresca el token si
  // venció, y por eso esto tiene que correr antes que cualquier página.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = pedido.nextUrl.pathname;
  const esPublica = PUBLICAS.some((p) => ruta === p || ruta.startsWith(p + "/"));

  if (!user && !esPublica) {
    const destino = pedido.nextUrl.clone();
    destino.pathname = "/entrar";
    // Para volver a donde quería ir después de entrar.
    destino.searchParams.set("volver", ruta);
    return NextResponse.redirect(destino);
  }

  if (user && ruta === "/entrar") {
    const destino = pedido.nextUrl.clone();
    destino.pathname = "/";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return respuesta;
}
