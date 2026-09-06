"""Conversión del esquema viejo (clave/valor) al relacional.

Todo lo de acá es función pura: entra el volcado de `mindfit_store`, salen
filas. No toca la red ni la base. Esa es la parte que se va a equivocar las
primeras veces, así que conviene poder correrla mil veces gratis.

El mapa de lo que se traduce:

    alumnos            → (nada; los usuarios los crea Auth, ver migrar.py)
    indice             → se usa solo para el estado de cada plan
    biblioteca         → ejercicios (los del coach)
    plan:<id>          → planes            (una fila)
    cargas:<id>.v/r/d/a→ registros         (una fila por serie)
    cargas:<id>.n      → plan_series       (una fila por override)
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from typing import Any

# Namespace fijo: el uuid de un plan sale determinísticamente de su clave
# vieja, así que correr la migración dos veces da los mismos ids y la segunda
# vez no duplica nada.
NS = uuid.UUID("6d696e64-6669-7420-7632-763300000000")

# `0-1-3-s2-e1` → día 0, bloque 1, ejercicio 3, semana 2 (1-based), serie 1.
CLAVE_SERIE = re.compile(r"^(\d+)-(\d+)-(\d+)-s(\d+)-e(\d+)$")
# La misma sin serie: son los pesos viejos, de cuando había uno por ejercicio.
CLAVE_BASE = re.compile(r"^(\d+)-(\d+)-(\d+)-s(\d+)$")

REPS_SERIES = re.compile(r"^(\d+)\s*[xX]\s*(\d+)$")   # "8x3" = 8 reps por 3 series
META_SERIES = re.compile(r"(\d+)\s*series", re.I)      # "3 series del circuito"

CARGAS_VALIDAS = {"kg", "corporal", "banda"}


@dataclass
class Plan:
    id: uuid.UUID
    alumno_id: uuid.UUID
    coach_id: uuid.UUID
    titulo: str
    semanas: int
    ciclo_carga: list[list[int]]
    estructura: list[dict[str, Any]]
    estado: str
    origen: str


@dataclass
class Registro:
    plan_id: uuid.UUID
    alumno_id: uuid.UUID
    dia: int
    bloque: int
    ejercicio: int
    semana: int          # 0-based, como los índices de array
    serie: int           # 1-based, como la ve el alumno
    carga: str | None
    reps: str | None
    hecha: bool
    heredada: bool


@dataclass
class SeriesDePlan:
    plan_id: uuid.UUID
    dia: int
    bloque: int
    ejercicio: int
    semana: int
    series: int


@dataclass
class Ejercicio:
    coach_id: uuid.UUID | None
    nombre: str
    video: str | None
    carga: str


@dataclass
class Conversion:
    planes: list[Plan] = field(default_factory=list)
    registros: list[Registro] = field(default_factory=list)
    series: list[SeriesDePlan] = field(default_factory=list)
    ejercicios: list[Ejercicio] = field(default_factory=list)
    # Todo lo que no se pudo traducir limpio. Es la salida más importante:
    # una migración silenciosa es una migración en la que no se puede confiar.
    avisos: list[str] = field(default_factory=list)


def normalizar_volcado(datos: dict) -> dict:
    """Acepta las dos formas en que pueden llegar los datos.

    De `mindfit_store` salen planos —{"plan:karina-agosto": {...}}— porque
    esa tabla es clave/valor. Pero el botón "Exportar copia de seguridad" de
    la app arma otra cosa: {"planes": {"karina-agosto": {...}}, "cargas": ...}.

    Cuando la app nunca estuvo conectada a Supabase, ese export es la única
    forma de rescatar lo que cargaron los alumnos, así que la conversión
    tiene que entender los dos.
    """
    if "planes" not in datos and "cargas" not in datos:
        return datos                       # ya viene plano

    plano = {
        "alumnos": datos.get("alumnos") or [],
        "indice": datos.get("indice") or [],
        "biblioteca": datos.get("biblioteca") or [],
    }
    for pid, plan in (datos.get("planes") or {}).items():
        if plan:
            plano[f"plan:{pid}"] = plan
    for pid, cargas in (datos.get("cargas") or {}).items():
        if cargas:
            plano[f"cargas:{pid}"] = cargas
    return plano


def id_de_plan(clave_vieja: str) -> uuid.UUID:
    return uuid.uuid5(NS, clave_vieja)


def series_de(ej: dict, bloque: dict, semana: int) -> tuple[int, str]:
    """Cuántas series lleva un ejercicio y con qué objetivo de reps.

    Port literal de seriesDe() en index.html. Si esto se desvía, la migración
    inventa o pierde series.
    """
    reps = ej.get("reps") or []
    txt = str(reps[semana]).strip() if semana < len(reps) and reps[semana] is not None else ""

    m = REPS_SERIES.match(txt)
    if m:
        return (ej.get("series") or int(m.group(2)), m.group(1))

    c = META_SERIES.search(str(bloque.get("meta") or ""))
    n = ej.get("series") or bloque.get("series") or (int(c.group(1)) if c else 3)
    return (n, re.sub(r"\s*reps$", "", txt, flags=re.I))


def _normalizar_cargas(c: Any) -> dict[str, dict]:
    c = c if isinstance(c, dict) else {}
    return {k: (c.get(k) or {}) for k in ("v", "a", "r", "d", "n")}


def _existe_ejercicio(plan: dict, d: int, bi: int, ei: int) -> bool:
    try:
        plan["dias"][d]["bloques"][bi]["ejercicios"][ei]
        return True
    except (IndexError, KeyError, TypeError):
        return False


def _expandir_claves_base(cargas: dict[str, dict], plan: dict) -> list[str]:
    """Los pesos viejos guardaban un kg por ejercicio, no por serie.

    La app los expande al abrir el plan (migrarCargas). Acá hay que hacer lo
    mismo, o los planes que nadie abrió desde entonces pierden sus pesos.
    Devuelve la lista de avisos de lo que se expandió.
    """
    avisos: list[str] = []
    dias = plan.get("dias") or []
    semanas = int(plan.get("semanas") or 4)

    for base in [k for k in cargas["v"] if CLAVE_BASE.match(k)]:
        d, bi, ei, s1 = (int(x) for x in CLAVE_BASE.match(base).groups())
        s = s1 - 1
        try:
            ej = dias[d]["bloques"][bi]["ejercicios"][ei]
            bloque = dias[d]["bloques"][bi]
        except (IndexError, KeyError, TypeError):
            avisos.append(f"peso viejo en «{base}» apunta a un ejercicio que ya no existe; se descarta")
            cargas["v"].pop(base, None)
            cargas["a"].pop(base, None)
            continue

        if not 0 <= s < semanas:
            avisos.append(f"peso viejo en «{base}» cae fuera de las {semanas} semanas; se descarta")
            cargas["v"].pop(base, None)
            cargas["a"].pop(base, None)
            continue

        n, _ = series_de(ej, bloque, s)
        for i in range(1, n + 1):
            k = f"{base}-e{i}"
            if k not in cargas["v"]:
                cargas["v"][k] = cargas["v"][base]
                if cargas["a"].get(base):
                    cargas["a"][k] = True
        avisos.append(f"peso viejo en «{base}» expandido a {n} series")
        cargas["v"].pop(base, None)
        cargas["a"].pop(base, None)

    return avisos


def convertir(
    volcado: dict[str, Any],
    usuarios: dict[str, uuid.UUID],
    coach_id: uuid.UUID,
) -> Conversion:
    """Traduce el volcado entero.

    `volcado`  — {clave: valor} tal cual sale de mindfit_store.
    `usuarios` — el id viejo de cada alumno → su uuid en auth.users.
    `coach_id` — el uuid del coach en auth.users.
    """
    out = Conversion()
    volcado = normalizar_volcado(volcado)

    indice = volcado.get("indice") or []
    estados = {p.get("id"): p.get("estado") for p in indice if isinstance(p, dict)}

    # ------------------------------------------------------------ biblioteca
    for e in volcado.get("biblioteca") or []:
        nombre = str(e.get("n") or "").strip()
        if not nombre:
            continue
        carga = e.get("carga") if e.get("carga") in CARGAS_VALIDAS else "kg"
        out.ejercicios.append(
            Ejercicio(coach_id=coach_id, nombre=nombre, video=e.get("v") or None, carga=carga)
        )

    # ----------------------------------------------------------------- planes
    for clave in sorted(k for k in volcado if k.startswith("plan:")):
        plan = volcado[clave]
        if not isinstance(plan, dict) or not plan.get("dias"):
            out.avisos.append(f"«{clave}» está vacío o no es un plan; se saltea")
            continue

        alumno_viejo = plan.get("alumnoId")
        if alumno_viejo not in usuarios:
            out.avisos.append(
                f"«{clave}» es del alumno «{alumno_viejo}», que no está en el mapa de usuarios; se saltea"
            )
            continue

        alumno_id = usuarios[alumno_viejo]
        pid = id_de_plan(clave)
        semanas = int(plan.get("semanas") or 4)
        semanas = max(1, min(12, semanas))
        ciclo = plan.get("cicloCarga") or [list(range(semanas))]

        out.planes.append(
            Plan(
                id=pid,
                alumno_id=alumno_id,
                coach_id=coach_id,
                titulo=str(plan.get("titulo") or "Mesociclo"),
                semanas=semanas,
                ciclo_carga=ciclo,
                estructura=plan["dias"],
                estado="archivado" if estados.get(plan.get("id")) == "archivado" else "activo",
                origen=clave,
            )
        )

        # ------------------------------------------------------------ cargas
        clave_cargas = "cargas:" + clave.split(":", 1)[1]
        cargas = _normalizar_cargas(volcado.get(clave_cargas))
        out.avisos += [f"{clave}: {a}" for a in _expandir_claves_base(cargas, plan)]

        # Una fila por serie que tenga *algo*: peso, reps o el tilde de hecha.
        vistas = set(cargas["v"]) | set(cargas["r"]) | set(cargas["d"])
        for k in sorted(vistas):
            m = CLAVE_SERIE.match(k)
            if not m:
                out.avisos.append(f"{clave}: la clave «{k}» no tiene la forma esperada; se descarta")
                continue
            d, bi, ei, s1, serie = (int(x) for x in m.groups())
            semana = s1 - 1
            if not 0 <= semana < semanas:
                out.avisos.append(f"{clave}: «{k}» cae fuera de las {semanas} semanas; se descarta")
                continue

            # No se descarta, pero se avisa: el plan cambió después de que
            # alguien cargó esto. La fila queda —el dato existió— pero no la
            # va a mostrar ninguna pantalla, y conviene saberlo.
            if not _existe_ejercicio(plan, d, bi, ei):
                out.avisos.append(f"{clave}: «{k}» apunta a un ejercicio que ya no está en el plan; se conserva igual")

            carga = str(cargas["v"].get(k)).strip() if cargas["v"].get(k) is not None else None
            reps = str(cargas["r"].get(k)).strip() if cargas["r"].get(k) is not None else None
            out.registros.append(
                Registro(
                    plan_id=pid,
                    alumno_id=alumno_id,
                    dia=d, bloque=bi, ejercicio=ei, semana=semana, serie=serie,
                    carga=carga or None,
                    reps=reps or None,
                    hecha=bool(cargas["d"].get(k)),
                    heredada=bool(cargas["a"].get(k)),
                )
            )

        # ----------------------------------- cuántas series tiene cada uno
        for k, n in sorted(cargas["n"].items()):
            m = CLAVE_BASE.match(k)
            if not m:
                out.avisos.append(f"{clave}: el override de series «{k}» no tiene la forma esperada; se descarta")
                continue
            d, bi, ei, s1 = (int(x) for x in m.groups())
            semana = s1 - 1
            try:
                n = int(n)
            except (TypeError, ValueError):
                out.avisos.append(f"{clave}: el override de series «{k}» vale «{n}», que no es un número; se descarta")
                continue
            if not (0 <= semana < semanas and 1 <= n <= 20):
                out.avisos.append(f"{clave}: el override de series «{k}» = {n} está fuera de rango; se descarta")
                continue
            out.series.append(
                SeriesDePlan(plan_id=pid, dia=d, bloque=bi, ejercicio=ei, semana=semana, series=n)
            )

    # Los planes que quedaron en el índice pero sin documento.
    for p in indice:
        if isinstance(p, dict) and p.get("id") and f"plan:{p['id']}" not in volcado:
            out.avisos.append(f"el índice menciona el plan «{p['id']}» pero no hay documento; se saltea")

    return out
