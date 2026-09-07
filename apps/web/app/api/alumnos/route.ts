import { NextResponse, type NextRequest } from "next/server";

import { DOMINIO_INTERNO, claveNueva, slug } from "@/lib/claves";
import { clienteServidor } from "@/lib/supabase/servidor";

/** Alta de un alumno, desde la app.
 *
 * Crear un usuario en Auth necesita la clave secreta, y esa nunca puede
 * viajar al navegador: por eso vive acá y no en un componente.
 *
 * La comprobación de que quien pide es un coach se hace con la SESIÓN del que
 * llama, no con la clave secreta. Es la diferencia entre una ruta que
 * autoriza y una que es una puerta abierta con un cartel: si preguntáramos
 * "¿existe un coach?" en vez de "¿sos vos ese coach?", cualquier alumno
 * logueado podría dar de alta gente.
 */

const MAX_NOMBRE = 60;

export async function POST(pedido: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secreta = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secreta) {
    return NextResponse.json({ error: "El servidor no está configurado." }, { status: 500 });
  }

  // ── ¿quién está pidiendo esto? ──────────────────────────────────────────
  const supabase = await clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  }

  // La consulta va con la sesión del que llama, así que RLS ya la limita a su
  // propio perfil. No hace falta confiar en nada que venga del cuerpo.
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("id, rol")
    .eq("id", user.id)
    .maybeSingle();

  if (perfil?.rol !== "coach") {
    // 403 y no 404: acá sí corresponde decir que no, porque quien pregunta ya
    // está identificado y no se le revela nada que no sepa de sí mismo.
    return NextResponse.json({ error: "Solo un coach puede dar de alta alumnos." },
                             { status: 403 });
  }

  // ── qué pidió ───────────────────────────────────────────────────────────
  let cuerpo: { nombre?: unknown; email?: unknown };
  try {
    cuerpo = await pedido.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const nombre = String(cuerpo.nombre ?? "").trim().replace(/\s+/g, " ");
  if (!nombre || nombre.length > MAX_NOMBRE) {
    return NextResponse.json({ error: "Falta el nombre." }, { status: 400 });
  }

  const pedido_email = String(cuerpo.email ?? "").trim().toLowerCase();
  const base = slug(nombre);
  if (!pedido_email && !base) {
    return NextResponse.json(
      { error: "Ese nombre no tiene letras con las que armar un usuario." },
      { status: 400 },
    );
  }

  const cabeceras = {
    apikey: secreta,
    Authorization: `Bearer ${secreta}`,
    "Content-Type": "application/json",
  };

  // ── un mail que no esté tomado ──────────────────────────────────────────
  // Sin dominio propio el mail es solo el nombre de usuario, así que se arma
  // solo. Dos "Karina" no pueden compartirlo: la segunda es karina2@.
  async function libre(email: string) {
    const r = await fetch(
      `${url}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
      { headers: cabeceras, cache: "no-store" },
    );
    if (!r.ok) return false;
    const { users } = (await r.json()) as { users: { email?: string }[] };
    return !users.some((u) => (u.email ?? "").toLowerCase() === email);
  }

  let email = pedido_email || `${base}@${DOMINIO_INTERNO}`;
  if (!pedido_email) {
    for (let i = 2; i <= 50 && !(await libre(email)); i++) {
      email = `${base}${i}@${DOMINIO_INTERNO}`;
    }
  }
  if (!(await libre(email))) {
    return NextResponse.json({ error: "Ese mail ya está en uso." }, { status: 409 });
  }

  // ── crearlo ─────────────────────────────────────────────────────────────
  const clave = claveNueva();
  const alta = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: cabeceras,
    // email_confirm: el mail de verificación no llegaría a ninguna parte.
    body: JSON.stringify({
      email, password: clave, email_confirm: true,
      user_metadata: { nombre },
    }),
    cache: "no-store",
  });

  if (!alta.ok) {
    return NextResponse.json({ error: "No se pudo crear el alumno." }, { status: 502 });
  }
  const { id } = (await alta.json()) as { id: string };

  // El trigger sobre auth.users ya le armó el perfil como alumno. Falta
  // colgarlo del coach, y eso solo lo puede hacer la clave secreta: el
  // trigger `perfiles_proteger_campos` le prohíbe a `authenticated` tocar
  // coach_id, justamente para que nadie se cambie de coach solo.
  const enlace = await fetch(`${url}/rest/v1/perfiles?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...cabeceras, Prefer: "return=minimal" },
    body: JSON.stringify({ coach_id: user.id, nombre }),
    cache: "no-store",
  });

  if (!enlace.ok) {
    // El usuario quedó creado pero suelto: es peor dejarlo así, invisible
    // para todos, que no haberlo creado.
    await fetch(`${url}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: cabeceras });
    return NextResponse.json({ error: "No se pudo asociar el alumno." }, { status: 502 });
  }

  // La contraseña se devuelve una sola vez: no se guarda en ningún lado y no
  // hay forma de volver a verla, solo de generar otra.
  return NextResponse.json({ nombre, email, clave });
}
