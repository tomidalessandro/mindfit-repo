"""Baja una copia de `mindfit_store` desde el proyecto de Supabase.

Solo lee. No escribe ni una fila en producción — y de eso depende que se pueda
correr con tranquilidad mientras un alumno está entrenando.

    uv run python -m mindfit_worker.volcar --salida datos/volcado.json
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

from .entorno import cargar


def bajar(url: str, clave: str) -> dict:
    pedido = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/mindfit_store?select=clave,valor,actualizado",
        headers={
            "apikey": clave,
            "Authorization": f"Bearer {clave}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(pedido, timeout=60) as r:
        filas = json.load(r)
    return {f["clave"]: f["valor"] for f in filas}


def main(argv: list[str] | None = None) -> int:
    cargar()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--salida", default="datos/volcado.json", type=pathlib.Path)
    args = ap.parse_args(argv)

    url = os.getenv("SUPABASE_URL")
    clave = os.getenv("SUPABASE_SECRET_KEY")
    if not url or not clave:
        print("Faltan SUPABASE_URL y SUPABASE_SECRET_KEY. Copiá .env.example a .env.", file=sys.stderr)
        return 1

    try:
        volcado = bajar(url, clave)
    except urllib.error.HTTPError as e:
        print(f"Supabase respondió {e.code}: {e.read().decode()[:300]}", file=sys.stderr)
        return 1

    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_text(json.dumps(volcado, ensure_ascii=False, indent=2), encoding="utf-8")

    planes = sum(1 for k in volcado if k.startswith("plan:"))
    alumnos = len(volcado.get("alumnos") or [])
    print(f"✓ {args.salida} · {len(volcado)} claves · {alumnos} alumnos · {planes} planes")
    print("  Esta copia es tu red de seguridad. Guardala antes de tocar nada.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
