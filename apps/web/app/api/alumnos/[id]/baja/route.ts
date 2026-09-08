import { NextResponse, type NextRequest } from "next/server";

import { clienteServidor } from "@/lib/supabase/servidor";

/** Dar de baja a un alumno, y volver a darlo de alta.
 *
 *   POST   /api/alumnos/<id>/baja   → lo archiva
 *   DELETE /api/alumnos/<id>/baja   → lo reactiva
 *
 * No borra nada. La fila del perfil se queda —sus mesociclos y sus pesos
 * dependen de ella— y solo se le pone la fecha de baja. La app deja de
 * mostrarlo entre los activos y en Auth queda bloqueado, así que su
 * contraseña deja de funcionar hasta que lo reactiven.
 *
 * Necesita la clave secreta por dos motivos: el trigger
 * `perfiles_campos_protegidos` le prohíbe a la app tocar `archivado_en` —o un
 * alumno se revivía solo después de que el coach lo archivó— y bloquear en
 * Auth es una operación de administración.
 */

async function autorizar(id: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secreta = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secreta) {
    return { error: NextResponse.json({ error: "El servidor no está configurado." }, { status: 500 }) };
  }

  const supabase = await clienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sin sesión." }, { status: 401 }) };

  // Las dos consultas van con la sesión del que llama, así que RLS ya las
  // limita. Preguntar con la clave secreta convertiría esto en una puerta
  // abierta: contestaría lo mismo para cualquiera.
  const [{ data: yo }, { data: alumno }] = await Promise.all([
    supabase.from("perfiles").select("id, rol").eq("id", user.id).maybeSingle(),
    supabase.from("perfiles").select("id, coach_id, rol").eq("id", id).maybeSingle(),
  ]);

  if (yo?.rol !== "coach" || !alumno || alumno.coach_id !== yo.id || alumno.rol !== "alumno") {
    // 404 y no 403: contestar distinto según exista o no confirmaría qué
    // cuentas hay.
    return { error: NextResponse.json({ error: "No encontrado." }, { status: 404 }) };
  }

  return {
    url, secreta,
    cabeceras: {
      apikey: secreta,
      Authorization: `Bearer ${secreta}`,
      "Content-Type": "application/json",
    },
  };
}

async function cambiar(
  id: string,
  { url, cabeceras }: { url: string; cabeceras: Record<string, string> },
  archivadoEn: string | null,
) {
  const perfil = await fetch(`${url}/rest/v1/perfiles?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...cabeceras, Prefer: "return=minimal" },
    body: JSON.stringify({ archivado_en: archivadoEn }),
    cache: "no-store",
  });
  if (!perfil.ok) return false;

  // Bloquear en Auth es lo que hace que la baja se note: sin esto el alumno
  // seguiría entrando con su contraseña y viendo su rutina, solo que el coach
  // no lo tendría en la lista. Es reversible — "none" lo desbloquea.
  await fetch(`${url}/auth/v1/admin/users/${id}`, {
    method: "PUT",
    headers: cabeceras,
    body: JSON.stringify({ ban_duration: archivadoEn ? "876000h" : "none" }),
    cache: "no-store",
  });
  return true;
}

export async function POST(_p: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await autorizar(id);
  if ("error" in ctx) return ctx.error;

  const ok = await cambiar(id, ctx, new Date().toISOString());
  return ok
    ? NextResponse.json({ archivado: true })
    : NextResponse.json({ error: "No se pudo dar de baja." }, { status: 502 });
}

export async function DELETE(_p: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await autorizar(id);
  if ("error" in ctx) return ctx.error;

  const ok = await cambiar(id, ctx, null);
  return ok
    ? NextResponse.json({ archivado: false })
    : NextResponse.json({ error: "No se pudo reactivar." }, { status: 502 });
}
