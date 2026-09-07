import Link from "next/link";
import { notFound } from "next/navigation";

import { perfilDe } from "@/lib/datos";
import { armarProgreso, type PlanConEstructura, type RegistroMinimo } from "@/lib/progreso";
import { clienteServidor } from "@/lib/supabase/servidor";
import type { Dia } from "@/lib/modelo";

import estilos from "./progreso.module.css";

export default async function PaginaProgreso({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const perfil = await perfilDe(id);
  if (!perfil) notFound();

  const supabase = await clienteServidor();
  const { data: usuario } = await supabase.auth.getUser();
  const soyYo = usuario.user?.id === id;

  // Acá se cobra el esquema relacional. En la v2 esto era abrir todos los
  // mesociclos, recorrer sus JSON de cargas y parsear claves de texto para
  // sacar el máximo de cada ejercicio. Ahora son dos consultas: RLS ya limita
  // lo que devuelven, así que no hay filtro por alumno que se pueda olvidar.
  const [planes, registros] = await Promise.all([
    supabase
      .from("planes")
      .select("id, titulo, creado, estructura")
      .eq("alumno_id", id)
      .order("creado"),
    supabase
      .from("registros")
      .select("plan_id, dia, bloque, ejercicio, carga")
      .eq("alumno_id", id)
      .not("carga", "is", null),
  ]);

  const progreso = armarProgreso(
    (planes.data ?? []).map((p) => ({
      ...p,
      estructura: (p.estructura as unknown as Dia[]) ?? [],
    })) as PlanConEstructura[],
    (registros.data ?? []) as RegistroMinimo[],
  );

  return (
    <main className={estilos.pantalla}>
      <Link href={soyYo ? "/" : `/alumno/${id}`} className={estilos.volver}>
        ‹ Volver
      </Link>

      <header className={estilos.cabecera}>
        <p className={estilos.eyebrow}>Evolución de cargas</p>
        <h1 className={estilos.titulo}>
          {soyYo ? "Tu progreso" : `Progreso de ${perfil.nombre}`}
        </h1>
        <p className={estilos.intro}>
          Cada ejercicio con el peso más alto registrado en cada mesociclo, del
          más viejo al más nuevo.
        </p>
      </header>

      {progreso.length === 0 ? (
        <div className={estilos.vacio}>
          <p className={estilos.vacioTitulo}>Todavía no hay pesos cargados</p>
          <p className={estilos.vacioTexto}>
            Apenas se registren kilos en algún mesociclo, acá aparece la
            evolución de cada ejercicio. Los que van con banda o peso corporal
            no aparecen: no tienen kilos que comparar.
          </p>
        </div>
      ) : (
        <>
          <p className={estilos.cuenta}>
            {progreso.length === 1 ? "1 ejercicio" : `${progreso.length} ejercicios`}
          </p>
          <ul className={estilos.lista}>
            {progreso.map((e) => (
              <li key={e.nombre} className={estilos.fila}>
                <div className={estilos.info}>
                  <p className={estilos.nombre}>{e.nombre}</p>
                  <p className={estilos.recorrido}>
                    {e.puntos.map((p) => `${p.kg} kg`).join("  →  ")}
                  </p>
                </div>
                <span
                  className={`${estilos.delta} ${
                    e.delta !== null && e.delta > 0 ? estilos.subio : ""
                  }`}
                >
                  {e.delta === null
                    ? `${e.puntos[0].kg} kg`
                    : `${e.delta > 0 ? "+" : ""}${e.delta} kg`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
