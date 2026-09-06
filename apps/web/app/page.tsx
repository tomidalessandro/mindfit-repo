import Link from "next/link";

import { misAlumnos, miPerfil, planesDe } from "@/lib/datos";

import estilos from "./inicio.module.css";
import { Salir } from "./salir";

export default async function Inicio() {
  const perfil = await miPerfil();

  // El middleware ya mandó a /entrar a quien no tiene sesión, así que llegar
  // acá sin perfil significa un usuario de Auth sin fila en `perfiles`.
  if (!perfil) {
    return (
      <main className={estilos.pantalla}>
        <p className={estilos.vacio}>
          Tu cuenta existe pero todavía no tiene perfil. Avisale a tu coach.
        </p>
        <Salir />
      </main>
    );
  }

  return perfil.rol === "coach" ? (
    <InicioCoach perfil={perfil} />
  ) : (
    <InicioAlumno perfil={perfil} />
  );
}

async function InicioCoach({ perfil }: { perfil: { id: string; nombre: string } }) {
  const alumnos = await misAlumnos(perfil.id);

  return (
    <main className={estilos.pantalla}>
      <header className={estilos.cabecera}>
        <div>
          <p className={estilos.hola}>Hola, {perfil.nombre}</p>
          <h1 className={estilos.titulo}>Tus alumnos</h1>
        </div>
        <Salir />
      </header>

      {alumnos.length === 0 ? (
        <p className={estilos.vacio}>
          Todavía no tenés alumnos. Se dan de alta invitándolos por mail desde
          Supabase Auth.
        </p>
      ) : (
        <ul className={estilos.lista}>
          {alumnos.map((a) => (
            <li key={a.id}>
              <Link href={`/alumno/${a.id}`} className={estilos.fila}>
                <span className={estilos.nombre}>{a.nombre}</span>
                <span className={estilos.flecha} aria-hidden="true">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

async function InicioAlumno({ perfil }: { perfil: { id: string; nombre: string } }) {
  const planes = await planesDe(perfil.id);
  const activos = planes.filter((p) => p.estado === "activo");

  return (
    <main className={estilos.pantalla}>
      <header className={estilos.cabecera}>
        <div>
          <p className={estilos.hola}>Hola, {perfil.nombre}</p>
          <h1 className={estilos.titulo}>Tus rutinas</h1>
        </div>
        <Salir />
      </header>

      {activos.length === 0 ? (
        <p className={estilos.vacio}>
          Todavía no tenés ningún mesociclo cargado. Tu coach te va a avisar
          cuando esté.
        </p>
      ) : (
        <ul className={estilos.lista}>
          {activos.map((p) => (
            <li key={p.id}>
              <Link href={`/plan/${p.id}`} className={estilos.fila}>
                <span className={estilos.nombre}>{p.titulo}</span>
                <span className={estilos.meta}>{p.semanas} semanas</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
