import { notFound } from "next/navigation";

import { clienteServidor } from "@/lib/supabase/servidor";
import type { Dia } from "@/lib/modelo";

import { PantallaPlan } from "./pantalla";

export default async function PaginaPlan({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await clienteServidor();

  // Las tres consultas son independientes: van juntas y no en fila.
  // RLS ya limita cada una a lo que este usuario puede ver, así que si el
  // plan es de otro alumno esto devuelve vacío y termina en un 404.
  const [plan, registros, series, sesion] = await Promise.all([
    supabase.from("planes").select("*").eq("id", id).maybeSingle(),
    supabase.from("registros").select("*").eq("plan_id", id),
    supabase.from("plan_series").select("*").eq("plan_id", id),
    supabase.auth.getUser(),
  ]);

  if (!plan.data) notFound();

  return (
    <PantallaPlan
      plan={{
        id: plan.data.id,
        titulo: plan.data.titulo,
        semanas: plan.data.semanas,
        alumnoId: plan.data.alumno_id,
        cicloCarga: (plan.data.ciclo_carga as number[][]) ?? [[0, 1, 2], [3]],
        dias: (plan.data.estructura as unknown as Dia[]) ?? [],
      }}
      registros={registros.data ?? []}
      series={series.data ?? []}
      soyElAlumno={sesion.data.user?.id === plan.data.alumno_id}
    />
  );
}
