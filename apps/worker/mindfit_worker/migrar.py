"""Escribe el volcado convertido en el esquema relacional.

Por defecto NO escribe: convierte, informa y se va. Para que toque la base hay
que pasar `--escribir` a propósito.

    uv run python -m mindfit_worker.migrar --plantilla-alumnos   # 1. armar el csv
    uv run python -m mindfit_worker.migrar                       # 2. ensayo
    uv run python -m mindfit_worker.migrar --escribir            # 3. en serio

Corre con una conexión que saltea RLS (postgres o service_role): es el único
lugar del sistema que ve los datos de todos los alumnos a la vez, y por eso
vive acá y no en el frontend.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import pathlib
import sys
import uuid

import psycopg

from .entorno import cargar
from .convertir import convertir

LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"


def plantilla_alumnos(volcado: dict, destino: pathlib.Path) -> None:
    """Escribe el csv que hay que completar con los mails.

    El modelo viejo identifica a cada alumno por su nombre (`#karina`). Auth
    necesita un mail. Ese dato no está en ningún lado: lo tiene que poner el
    coach, y por eso la migración no puede ser del todo automática.
    """
    destino.parent.mkdir(parents=True, exist_ok=True)
    with destino.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id_viejo", "nombre", "email"])
        for a in volcado.get("alumnos") or []:
            w.writerow([a.get("id", ""), a.get("nombre", ""), ""])
    print(f"✓ {destino} — completá la columna email y volvé a correr")


def leer_alumnos(ruta: pathlib.Path) -> dict[str, str]:
    with ruta.open(encoding="utf-8") as f:
        filas = list(csv.DictReader(f))
    faltan = [r["nombre"] for r in filas if not (r.get("email") or "").strip()]
    if faltan:
        raise SystemExit("Sin mail no hay usuario de Auth. Falta el de: " + ", ".join(faltan))
    return {r["id_viejo"]: r["email"].strip().lower() for r in filas}


def usuarios_de_auth(cur, emails: dict[str, str], crear: bool) -> dict[str, uuid.UUID]:
    """Resuelve id viejo → uuid de auth.users.

    Con `crear`, da de alta los que falten. Eso sirve para la base local; en
    producción los usuarios se crean por invitación desde Supabase Auth, para
    que salga el mail con el link mágico.
    """
    mapa: dict[str, uuid.UUID] = {}
    for viejo, email in emails.items():
        cur.execute("select id from auth.users where lower(email) = %s", (email,))
        fila = cur.fetchone()
        if fila:
            mapa[viejo] = fila[0]
            continue
        if not crear:
            raise SystemExit(
                f"No existe el usuario «{email}». Invitalo desde Supabase Auth, "
                "o pasá --crear-usuarios si estás sobre la base local."
            )
        nuevo = uuid.uuid4()
        cur.execute(
            """insert into auth.users
                 (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
               values (%s, '00000000-0000-0000-0000-000000000000',
                       'authenticated', 'authenticated', %s, %s, now(), now())""",
            (nuevo, email, json.dumps({"nombre": viejo})),
        )
        mapa[viejo] = nuevo
    return mapa


def escribir(cur, c) -> None:
    cur.executemany(
        """insert into public.planes
             (id, alumno_id, coach_id, titulo, semanas, ciclo_carga, estructura, estado, origen)
           values (%s,%s,%s,%s,%s,%s,%s,%s,%s)
           on conflict (id) do update set
             titulo = excluded.titulo, semanas = excluded.semanas,
             ciclo_carga = excluded.ciclo_carga, estructura = excluded.estructura,
             estado = excluded.estado,
             -- alumno_id y coach_id también, o un plan que se reasigna a otra
             -- persona se queda con el dueño viejo y la corrida no avisa nada.
             alumno_id = excluded.alumno_id, coach_id = excluded.coach_id""",
        [(p.id, p.alumno_id, p.coach_id, p.titulo, p.semanas,
          json.dumps(p.ciclo_carga), json.dumps(p.estructura, ensure_ascii=False),
          p.estado, p.origen) for p in c.planes],
    )
    cur.executemany(
        """insert into public.registros
             (plan_id, alumno_id, dia, bloque, ejercicio, semana, serie, carga, reps, hecha, heredada)
           values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
           on conflict (plan_id, dia, bloque, ejercicio, semana, serie) do update set
             carga = excluded.carga, reps = excluded.reps,
             hecha = excluded.hecha, heredada = excluded.heredada""",
        [(r.plan_id, r.alumno_id, r.dia, r.bloque, r.ejercicio, r.semana, r.serie,
          r.carga, r.reps, r.hecha, r.heredada) for r in c.registros],
    )
    cur.executemany(
        """insert into public.plan_series (plan_id, dia, bloque, ejercicio, semana, series)
           values (%s,%s,%s,%s,%s,%s)
           on conflict (plan_id, dia, bloque, ejercicio, semana) do update set
             series = excluded.series""",
        [(s.plan_id, s.dia, s.bloque, s.ejercicio, s.semana, s.series) for s in c.series],
    )
    cur.executemany(
        """insert into public.ejercicios (coach_id, nombre, video, carga)
           values (%s,%s,%s,%s) on conflict do nothing""",
        [(e.coach_id, e.nombre, e.video, e.carga) for e in c.ejercicios],
    )


def main(argv: list[str] | None = None) -> int:
    cargar()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--volcado", default="datos/volcado.json", type=pathlib.Path)
    ap.add_argument("--alumnos", default="datos/alumnos.csv", type=pathlib.Path)
    ap.add_argument("--plantilla-alumnos", action="store_true",
                    help="escribe el csv de alumnos a completar y termina")
    ap.add_argument("--coach-email", help="el mail del coach en Auth")
    ap.add_argument("--crear-usuarios", action="store_true",
                    help="da de alta en auth.users los que falten (solo para la base local)")
    ap.add_argument("--escribir", action="store_true",
                    help="sin esto no toca la base: convierte, informa y se va")
    args = ap.parse_args(argv)

    if not args.volcado.exists():
        print(f"No encuentro {args.volcado}. Corré primero: python -m mindfit_worker.volcar", file=sys.stderr)
        return 1
    volcado = json.loads(args.volcado.read_text(encoding="utf-8"))

    if args.plantilla_alumnos:
        plantilla_alumnos(volcado, args.alumnos)
        return 0

    if not args.alumnos.exists():
        print(f"No encuentro {args.alumnos}. Corré: --plantilla-alumnos", file=sys.stderr)
        return 1
    emails = leer_alumnos(args.alumnos)

    coach_email = (args.coach_email or os.getenv("COACH_EMAIL") or "").strip().lower()
    if not coach_email:
        print("Falta --coach-email (o COACH_EMAIL en el .env).", file=sys.stderr)
        return 1

    dsn = os.getenv("DATABASE_URL", LOCAL)
    es_local = "127.0.0.1" in dsn or "localhost" in dsn
    if args.crear_usuarios and not es_local:
        print("--crear-usuarios es solo para la base local. En producción, invitalos desde Auth.", file=sys.stderr)
        return 1

    with psycopg.connect(dsn) as con, con.cursor() as cur:
        mapa = usuarios_de_auth(cur, {"__coach__": coach_email} | emails, args.crear_usuarios)
        coach_id = mapa.pop("__coach__")
        cur.execute("select public.promover_a_coach(%s)", (coach_id,))
        cur.execute(
            "update public.perfiles set coach_id = %s where id = any(%s)",
            (coach_id, list(mapa.values())),
        )

        c = convertir(volcado, mapa, coach_id)

        print(f"\n  planes      {len(c.planes):>5}")
        print(f"  registros   {len(c.registros):>5}")
        print(f"  series      {len(c.series):>5}")
        print(f"  ejercicios  {len(c.ejercicios):>5}")

        if c.avisos:
            print(f"\n  {len(c.avisos)} avisos — leelos, son lo que la conversión no pudo traducir limpio:")
            for a in c.avisos:
                print(f"    · {a}")

        if not args.escribir:
            con.rollback()
            print("\n  Ensayo. No se escribió nada. Para hacerlo en serio: --escribir")
            return 0

        escribir(cur, c)
        con.commit()
        print("\n  ✓ escrito")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
