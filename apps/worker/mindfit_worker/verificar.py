"""Compara el volcado viejo contra lo que quedó en la base nueva.

Es el paso que hace que el cutover se pueda hacer sin cruzar los dedos: no
alcanza con que la migración no haya explotado, hay que poder afirmar que
ningún peso se perdió por el camino.

    uv run python -m mindfit_worker.verificar --coach-email ...

Sale 0 si todo cuadra, 1 si hay una sola diferencia.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys

import psycopg

from .entorno import cargar
from .convertir import convertir
from .migrar import LOCAL, leer_alumnos


def main(argv: list[str] | None = None) -> int:
    cargar()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--volcado", default="datos/volcado.json", type=pathlib.Path)
    ap.add_argument("--alumnos", default="datos/alumnos.csv", type=pathlib.Path)
    ap.add_argument("--coach-email")
    args = ap.parse_args(argv)

    volcado = json.loads(args.volcado.read_text(encoding="utf-8"))
    emails = leer_alumnos(args.alumnos)
    coach_email = (args.coach_email or os.getenv("COACH_EMAIL") or "").strip().lower()

    with psycopg.connect(os.getenv("DATABASE_URL", LOCAL)) as con, con.cursor() as cur:
        cur.execute("select id from auth.users where lower(email) = %s", (coach_email,))
        fila = cur.fetchone()
        if not fila:
            print(f"No existe el coach «{coach_email}» en auth.users.", file=sys.stderr)
            return 1
        coach_id = fila[0]

        mapa = {}
        for viejo, email in emails.items():
            cur.execute("select id from auth.users where lower(email) = %s", (email,))
            f = cur.fetchone()
            if f:
                mapa[viejo] = f[0]

        esperado = convertir(volcado, mapa, coach_id)

        # Lo que la conversión dice que tendría que estar, contra lo que está.
        cur.execute("select id, titulo, semanas, estado from public.planes")
        planes_db = {r[0]: r[1:] for r in cur.fetchall()}
        cur.execute("""select plan_id, dia, bloque, ejercicio, semana, serie,
                              carga, reps, hecha, heredada from public.registros""")
        reg_db = {r[:6]: r[6:] for r in cur.fetchall()}
        cur.execute("select plan_id, dia, bloque, ejercicio, semana, series from public.plan_series")
        ser_db = {r[:5]: r[5] for r in cur.fetchall()}

    fallas: list[str] = []

    for p in esperado.planes:
        if p.id not in planes_db:
            fallas.append(f"falta el plan «{p.origen}» ({p.titulo})")
        elif planes_db[p.id] != (p.titulo, p.semanas, p.estado):
            fallas.append(f"el plan «{p.origen}» quedó distinto: {planes_db[p.id]} ≠ "
                          f"{(p.titulo, p.semanas, p.estado)}")

    for r in esperado.registros:
        k = (r.plan_id, r.dia, r.bloque, r.ejercicio, r.semana, r.serie)
        if k not in reg_db:
            fallas.append(f"falta el registro {r.dia}-{r.bloque}-{r.ejercicio}-s{r.semana+1}-e{r.serie}")
        elif reg_db[k] != (r.carga, r.reps, r.hecha, r.heredada):
            fallas.append(f"el registro {r.dia}-{r.bloque}-{r.ejercicio}-s{r.semana+1}-e{r.serie} "
                          f"quedó {reg_db[k]} y esperaba {(r.carga, r.reps, r.hecha, r.heredada)}")

    for s in esperado.series:
        k = (s.plan_id, s.dia, s.bloque, s.ejercicio, s.semana)
        if ser_db.get(k) != s.series:
            fallas.append(f"las series de {s.dia}-{s.bloque}-{s.ejercicio}-s{s.semana+1} "
                          f"quedaron en {ser_db.get(k)} y esperaba {s.series}")

    # Y al revés: nada en la base que no venga del volcado.
    sobran = set(reg_db) - {(r.plan_id, r.dia, r.bloque, r.ejercicio, r.semana, r.serie)
                            for r in esperado.registros}
    for k in sorted(sobran, key=str):
        fallas.append(f"hay un registro en la base que no está en el volcado: {k[1]}-{k[2]}-{k[3]}-s{k[4]+1}-e{k[5]}")

    print(f"  planes     {len(esperado.planes):>5} esperados · {len(planes_db):>5} en la base")
    print(f"  registros  {len(esperado.registros):>5} esperados · {len(reg_db):>5} en la base")
    print(f"  series     {len(esperado.series):>5} esperados · {len(ser_db):>5} en la base")

    if fallas:
        print(f"\n  ✗ {len(fallas)} diferencias:")
        for f in fallas[:50]:
            print(f"    · {f}")
        if len(fallas) > 50:
            print(f"    … y {len(fallas) - 50} más")
        return 1

    print("\n  ✓ no se perdió nada: cada peso, cada rep y cada tilde del volcado está en la base")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
