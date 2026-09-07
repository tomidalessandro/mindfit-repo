import Link from "next/link";
import { notFound } from "next/navigation";

import { perfilDe, planesDe } from "@/lib/datos";

import estilos from "./alumno.module.css";

export default async function PaginaAlumno({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const perfil = await perfilDe(id);
  // RLS ya filtró: si llega null, o no existe o no es alumno de quien mira.
  // Las dos cosas se contestan igual, porque un "no tenés permiso" confirmaría
  // que esa persona existe.
  if (!perfil) notFound();

  const planes = await planesDe(id);
  const activos = planes.filter((p) => p.estado === "activo");
  const archivados = planes.filter((p) => p.estado === "archivado");

  return (
    <main className={estilos.pantalla}>
      <Link href="/" className={estilos.volver}>
        ‹ Tus alumnos
      </Link>

      <header className={estilos.cabecera}>
        <h1 className={estilos.titulo}>{perfil.nombre}</h1>
        <p className={estilos.meta}>
          {activos.length === 0
            ? "Sin mesociclo activo"
            : activos.length === 1
              ? "1 mesociclo activo"
              : `${activos.length} mesociclos activos`}
        </p>
      </header>

      {planes.length === 0 ? (
        <p className={estilos.vacio}>
          Todavía no tiene ninguna rutina cargada. Por ahora los mesociclos se
          arman desde el worker; la pantalla para crearlos acá está pendiente.
        </p>
      ) : (
        <>
          <ul className={estilos.lista}>
            {activos.map((p) => (
              <li key={p.id}>
                <Link href={`/plan/${p.id}`} className={estilos.fila}>
                  <span className={estilos.nombre}>{p.titulo}</span>
                  <span className={estilos.semanas}>{p.semanas} semanas</span>
                </Link>
              </li>
            ))}
          </ul>

          {archivados.length > 0 && (
            <section className={estilos.archivados}>
              <h2 className={estilos.subtitulo}>Archivados</h2>
              <ul className={estilos.lista}>
                {archivados.map((p) => (
                  <li key={p.id}>
                    <Link href={`/plan/${p.id}`} className={`${estilos.fila} ${estilos.filaTenue}`}>
                      <span className={estilos.nombre}>{p.titulo}</span>
                      <span className={estilos.semanas}>{p.semanas} semanas</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
