import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "./tipos";

/** Rutas que se pueden abrir sin sesión. Todo lo demás manda a /entrar.
 *
 * `/e` es la del link de acceso directo: si pidiera sesión no serviría para
 * nada, porque su razón de existir es dártela. */
const PUBLICAS = ["/entrar", "/auth", "/e"];

export async function refrescarSesion(pedido: NextRequest) {
  const ruta = pedido.nextUrl.pathname;

  // Supabase manda el mail con `redirect_to` apuntando al Site URL cuando la
  // ruta de callback no está en la lista blanca del proyecto — y ahí el link
  // aterriza en "/" con el código colgando, sin sesión, y el usuario rebota a
  // /entrar en un loop que no explica nada. Esto lo endereza: venga a donde
  // venga, si trae un código va al callback.
  const codigo = pedido.nextUrl.searchParams.get("code");
  if (codigo && !ruta.startsWith("/auth/")) {
    const destino = pedido.nextUrl.clone();
    destino.pathname = "/auth/confirmar";
    destino.searchParams.set("volver", ruta);
    return NextResponse.redirect(destino);
  }

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
  // de confiar en lo que dice la cookie. Entre medio lo refresca si venció, y
  // por eso tiene que correr antes que cualquier página.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const esPublica = PUBLICAS.some((p) => ruta === p || ruta.startsWith(p + "/"));

  if (!user && !esPublica) {
    const destino = pedido.nextUrl.clone();
    destino.pathname = "/entrar";
    destino.search = "";
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
