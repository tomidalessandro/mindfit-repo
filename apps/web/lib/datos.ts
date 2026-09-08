import { clienteServidor } from "./supabase/servidor";

import type { Database } from "./supabase/tipos";

export type Perfil = Database["public"]["Tables"]["perfiles"]["Row"];
export type Plan = Database["public"]["Tables"]["planes"]["Row"];

/** El perfil de quien está mirando.
 *
 * Devuelve null si el usuario existe en Auth pero todavía no tiene perfil.
 * No debería pasar —lo crea un trigger al dar de alta— pero si pasa, es mejor
 * una pantalla que lo diga que un error sin explicación. */
export async function miPerfil(): Promise<Perfil | null> {
  const supabase = await clienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return data;
}

/** Los alumnos del coach.
 *
 * No hace falta filtrar por coach_id: la política "perfil visible" ya limita
 * lo que devuelve a los alumnos propios. El .eq() está igual, porque una
 * consulta que solo funciona por lo que hace RLS es una consulta que se rompe
 * en silencio el día que alguien toca una política. */
export async function misAlumnos(coachId: string): Promise<Perfil[]> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("perfiles")
    .select("*")
    .eq("coach_id", coachId)
    // Los dados de baja no van en la lista de trabajo. Siguen en la base con
    // todo lo suyo; se ven aparte.
    .is("archivado_en", null)
    .order("nombre");

  return data ?? [];
}

/** Los alumnos dados de baja, con cuánto dejaron cargado.
 *
 * Sale de la vista `alumnos_archivados`, que es la "tabla de deprecados": los
 * mismos perfiles, filtrados por fecha de baja. RLS aplica igual que en la
 * tabla, así que cada coach ve solo los suyos. */
export async function misArchivados(coachId: string) {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("alumnos_archivados")
    .select("id, nombre, archivado_en, planes, registros")
    .eq("coach_id", coachId)
    .order("archivado_en", { ascending: false });

  return data ?? [];
}

/** El perfil de un alumno.
 *
 * Devuelve null si no existe o si quien mira no tiene por qué verlo: la
 * política "perfil visible" solo deja pasar el propio y los de sus alumnos,
 * así que el coach de otro gimnasio recibe null y termina en un 404. Eso es
 * lo correcto: un "no tenés permiso" ya confirmaría que esa persona existe. */
export async function perfilDe(id: string): Promise<Perfil | null> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("perfiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  return data;
}

export async function planesDe(alumnoId: string): Promise<Plan[]> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("planes")
    .select("*")
    .eq("alumno_id", alumnoId)
    .order("estado")
    .order("creado", { ascending: false });

  return data ?? [];
}
