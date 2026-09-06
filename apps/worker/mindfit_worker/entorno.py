"""Dónde buscar las variables de entorno.

Acepta el `.env.local` en la raíz del repo (que es donde uno espera ponerlo)
y también un `.env` propio del worker, para cuando se despliegue solo.
El primero que define una variable gana.
"""

from __future__ import annotations

import pathlib

from dotenv import load_dotenv

RAIZ = pathlib.Path(__file__).resolve().parents[3]
WORKER = pathlib.Path(__file__).resolve().parents[1]


def cargar() -> None:
    for ruta in (RAIZ / ".env.local", RAIZ / ".env", WORKER / ".env"):
        if ruta.exists():
            load_dotenv(ruta, override=False)
