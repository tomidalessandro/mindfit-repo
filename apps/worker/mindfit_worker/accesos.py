"""Genera los links de acceso directo, uno por persona.

Para el período de prueba: los alumnos entran con un link que se manda por
WhatsApp, sin mail y sin contraseña.

    uv run python -m mindfit_worker.accesos --listar
    uv run python -m mindfit_worker.accesos --generar --base https://mindfit-v3.vercel.app
    uv run python -m mindfit_worker.accesos --revocar nicodalessandro11@gmail.com

El código no reemplaza a la sesión: la ruta /e/<codigo> lo canjea por una
sesión de verdad, y de ahí en adelante manda RLS. Es un token al portador en
una URL —quien tiene el link, entra— así que se manda por un canal privado y
se revoca cuando termina la prueba.
"""

from __future__ import annotations

import argparse
import os
import secrets
import sys

import psycopg

from .entorno import cargar
from .migrar import LOCAL

# 20 caracteres de un alfabeto de 32 ≈ 100 bits. No se adivina, y no se
# confunde al leerlo en voz alta: sin i, l, o, u, 0 ni 1.
ALFABETO = "abcdefghjkmnpqrstvwxyz23456789"


def nuevo_codigo() -> str:
    return "".join(secrets.choice(ALFABETO) for _ in range(20))


def main(argv: list[str] | None = None) -> int:
    cargar()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default=os.getenv("APP_URL", "http://localhost:3000"),
                    help="la URL de la app, para armar los links")
    ap.add_argument("--generar", action="store_true",
                    help="le da un código a quien no tenga")
    ap.add_argument("--rotar", action="store_true",
                    help="reemplaza los códigos existentes (invalida los links viejos)")
    ap.add_argument("--revocar", metavar="EMAIL",
                    help="apaga el acceso directo de esa persona")
    ap.add_argument("--listar", action="store_true", help="muestra los links")
    args = ap.parse_args(argv)

    base = args.base.rstrip("/")

    with psycopg.connect(os.getenv("DATABASE_URL", LOCAL), connect_timeout=20) as con, con.cursor() as cur:
        if args.revocar:
            cur.execute("""update public.perfiles p set codigo_acceso = null
                           from auth.users u
                           where u.id = p.id and lower(u.email) = %s""",
                        (args.revocar.strip().lower(),))
            con.commit()
            print(f"✓ revocado el acceso directo de {args.revocar} ({cur.rowcount} perfil)")
            return 0

        if args.generar or args.rotar:
            cur.execute(
                "select id from public.perfiles"
                + ("" if args.rotar else " where codigo_acceso is null")
            )
            for (pid,) in cur.fetchall():
                cur.execute("update public.perfiles set codigo_acceso = %s where id = %s",
                            (nuevo_codigo(), pid))
            con.commit()

        cur.execute("""select p.nombre, p.rol, u.email, p.codigo_acceso
                       from public.perfiles p join auth.users u on u.id = p.id
                       order by p.rol desc, p.nombre""")
        filas = cur.fetchall()

    if not filas:
        print("No hay perfiles todavía.", file=sys.stderr)
        return 1

    for nombre, rol, email, codigo in filas:
        print(f"\n{nombre} · {rol} · {email}")
        print(f"  {base}/e/{codigo}" if codigo else "  (sin acceso directo)")

    print("\nMandalos por un canal privado: quien tenga el link, entra.")
    print("Para apagarlos al terminar la prueba: --revocar <email>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
