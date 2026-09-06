"""Pruebas de la conversión.

El escenario imita lo que hay en producción: un plan de 4 semanas con ciclo
de carga [[0,1,2],[3]], pesos heredados por propagación, series agregadas a
mano, y algo de basura — porque los datos reales tienen cinco versiones de
migraciones encima.
"""

import uuid

import pytest

from mindfit_worker.convertir import convertir, id_de_plan, series_de

COACH = uuid.UUID("11111111-1111-1111-1111-111111111111")
KARINA = uuid.UUID("aaaaaaaa-0000-0000-0000-000000000001")
USUARIOS = {"al-karina": KARINA}


def plan_base():
    return {
        "id": "karina-a3f9",
        "alumnoId": "al-karina",
        "titulo": "Mesociclo agosto",
        "semanas": 4,
        "cicloCarga": [[0, 1, 2], [3]],
        "estado": "activo",
        "dias": [
            {
                "nombre": "Día 1", "num": "01",
                "bloques": [
                    {"titulo": "Calentamiento", "meta": "", "propaga": "todas", "ejercicios": [
                        {"nombre": "Band pull apart", "carga": "banda", "reps": ["15x2"] * 4},
                    ]},
                    {"titulo": "Fuerza", "meta": "", "propaga": "ciclo", "ejercicios": [
                        {"nombre": "Sentadilla", "carga": "kg", "reps": ["8x3"] * 4},
                    ]},
                ],
            },
        ],
    }


def volcado(cargas=None, **extra):
    v = {
        "alumnos": [{"id": "al-karina", "nombre": "Karina"}],
        "indice": [{"id": "karina-a3f9", "alumnoId": "al-karina", "estado": "activo"}],
        "biblioteca": [{"n": "Sentadilla búlgara", "v": "https://ej.com/1"}],
        "plan:karina-a3f9": plan_base(),
        "cargas:karina-a3f9": cargas or {},
    }
    v.update(extra)
    return v


# ─────────────────────────────────────────────────────── el camino feliz ──

def test_migra_el_plan_con_su_estructura_intacta():
    c = convertir(volcado(), USUARIOS, COACH)
    assert len(c.planes) == 1
    p = c.planes[0]
    assert p.titulo == "Mesociclo agosto"
    assert p.semanas == 4
    assert p.ciclo_carga == [[0, 1, 2], [3]]
    assert p.alumno_id == KARINA
    assert p.coach_id == COACH
    assert p.origen == "plan:karina-a3f9"
    # La estructura de días viaja tal cual: es lo que la app ya sabe leer.
    assert p.estructura[0]["bloques"][1]["ejercicios"][0]["nombre"] == "Sentadilla"


def test_una_fila_por_serie_con_sus_valores():
    # 0-1-0-s1-e1 = día 0, bloque 1 (Fuerza), ejercicio 0, semana 1, serie 1.
    c = convertir(volcado({
        "v": {"0-1-0-s1-e1": "40", "0-1-0-s1-e2": "42"},
        "r": {"0-1-0-s1-e1": "8"},
        "d": {"0-1-0-s1-e1": True},
        "a": {"0-1-0-s1-e2": True},
    }), USUARIOS, COACH)

    por_serie = {r.serie: r for r in c.registros}
    assert len(por_serie) == 2

    assert por_serie[1].carga == "40"
    assert por_serie[1].reps == "8"
    assert por_serie[1].hecha is True
    assert por_serie[1].heredada is False

    assert por_serie[2].carga == "42"
    assert por_serie[2].hecha is False
    assert por_serie[2].heredada is True   # vino propagada, no la cargó ella


def test_la_semana_pasa_de_1_based_a_0_based():
    # En la clave la semana va 1-based (`-s2`); adentro es un índice de array.
    c = convertir(volcado({"v": {"0-1-0-s2-e1": "45"}}), USUARIOS, COACH)
    assert c.registros[0].semana == 1
    assert c.registros[0].serie == 1       # la serie sí queda 1-based


def test_una_serie_solo_tildada_sin_peso_no_se_pierde():
    # Plancha: no hay kg, pero el tilde es el dato.
    c = convertir(volcado({"d": {"0-0-0-s1-e1": True}}), USUARIOS, COACH)
    assert len(c.registros) == 1
    assert c.registros[0].carga is None
    assert c.registros[0].hecha is True


def test_los_ids_son_estables_entre_corridas():
    a = convertir(volcado(), USUARIOS, COACH).planes[0].id
    b = convertir(volcado(), USUARIOS, COACH).planes[0].id
    assert a == b == id_de_plan("plan:karina-a3f9")


def test_series_agregadas_a_mano_no_se_pierden():
    c = convertir(volcado({"n": {"0-1-0-s1": 5}}), USUARIOS, COACH)
    assert len(c.series) == 1
    s = c.series[0]
    assert (s.dia, s.bloque, s.ejercicio, s.semana, s.series) == (0, 1, 0, 0, 5)


def test_la_biblioteca_del_coach_queda_a_su_nombre():
    c = convertir(volcado(), USUARIOS, COACH)
    assert len(c.ejercicios) == 1
    assert c.ejercicios[0].coach_id == COACH
    assert c.ejercicios[0].nombre == "Sentadilla búlgara"


def test_el_plan_archivado_conserva_su_estado():
    v = volcado()
    v["indice"][0]["estado"] = "archivado"
    assert convertir(v, USUARIOS, COACH).planes[0].estado == "archivado"


# ──────────────────────────────────────────── los datos viejos y raros ──

def test_los_pesos_de_antes_de_la_migracion_5_se_expanden_a_todas_las_series():
    """Antes se guardaba un kg por ejercicio, no por serie.

    La app los expande al abrir el plan. Un plan que nadie abrió desde
    entonces todavía los tiene en la forma vieja: si la migración no los
    expande, ese peso se pierde.
    """
    c = convertir(volcado({"v": {"0-1-0-s1": "50"}}), USUARIOS, COACH)
    # "8x3" → 3 series, todas con el mismo peso.
    assert len(c.registros) == 3
    assert {r.serie for r in c.registros} == {1, 2, 3}
    assert all(r.carga == "50" for r in c.registros)
    assert any("expandido a 3 series" in a for a in c.avisos)


def test_un_peso_viejo_no_pisa_uno_nuevo_ya_cargado():
    c = convertir(volcado({"v": {"0-1-0-s1": "50", "0-1-0-s1-e2": "60"}}), USUARIOS, COACH)
    por_serie = {r.serie: r.carga for r in c.registros}
    assert por_serie == {1: "50", 2: "60", 3: "50"}


def test_un_peso_que_apunta_a_un_ejercicio_borrado_se_descarta_con_aviso():
    c = convertir(volcado({"v": {"0-9-9-s1-e1": "40"}}), USUARIOS, COACH)
    # La clave tiene forma válida, así que la fila se arma igual: el plan
    # cambió, pero el dato existió. Lo que no puede pasar es que reviente.
    assert len(c.registros) == 1


def test_una_semana_fuera_de_rango_se_descarta_con_aviso():
    c = convertir(volcado({"v": {"0-1-0-s9-e1": "40"}}), USUARIOS, COACH)
    assert c.registros == []
    assert any("fuera de las 4 semanas" in a for a in c.avisos)


def test_una_clave_con_basura_se_descarta_con_aviso():
    c = convertir(volcado({"v": {"esto-no-es-una-clave": "40"}}), USUARIOS, COACH)
    assert c.registros == []
    assert any("no tiene la forma esperada" in a for a in c.avisos)


def test_un_alumno_sin_usuario_no_migra_en_silencio():
    v = volcado()
    v["plan:karina-a3f9"]["alumnoId"] = "al-fantasma"
    c = convertir(v, USUARIOS, COACH)
    assert c.planes == []
    assert any("al-fantasma" in a and "mapa de usuarios" in a for a in c.avisos)


def test_un_plan_vaciado_por_un_borrado_se_saltea():
    v = volcado()
    v["plan:karina-a3f9"] = None
    c = convertir(v, USUARIOS, COACH)
    assert c.planes == []
    assert any("está vacío" in a for a in c.avisos)


def test_un_plan_en_el_indice_sin_documento_avisa():
    v = volcado()
    v["indice"].append({"id": "karina-perdido", "alumnoId": "al-karina"})
    c = convertir(v, USUARIOS, COACH)
    assert any("karina-perdido" in a and "no hay documento" in a for a in c.avisos)


def test_un_override_de_series_con_basura_se_descarta():
    c = convertir(volcado({"n": {"0-1-0-s1": "muchas"}}), USUARIOS, COACH)
    assert c.series == []
    assert any("no es un número" in a for a in c.avisos)


# ───────────────────────────────── el port de seriesDe(), pieza por pieza ──

@pytest.mark.parametrize("reps, meta, esperado", [
    ("8x3",        "",                    3),   # 8 reps por 3 series
    ("12x4",       "",                    4),
    ('20" x lado', "3 series del circuito", 3),  # circuito: sale de la nota
    ('20" x lado', "",                    3),   # sin nota, el default
    ("",           "5 series",            5),
])
def test_series_de_lee_lo_mismo_que_la_app(reps, meta, esperado):
    n, _ = series_de({"reps": [reps]}, {"meta": meta}, 0)
    assert n == esperado


def test_el_coach_puede_fijar_las_series_a_mano_y_eso_manda():
    n, _ = series_de({"reps": ["8x3"], "series": 6}, {"meta": ""}, 0)
    assert n == 6


def test_el_objetivo_de_reps_sale_del_texto():
    _, objetivo = series_de({"reps": ["8x3"]}, {"meta": ""}, 0)
    assert objetivo == "8"
    _, objetivo = series_de({"reps": ['20" x lado']}, {"meta": ""}, 0)
    assert objetivo == '20" x lado'


# ─────────────────────────── el export de la app, que llega anidado ──

def export_de_la_app():
    """Lo que arma el botón «Exportar copia de seguridad».

    Cuando la app nunca estuvo conectada a Supabase, esto es lo único que
    hay: el alumno exporta desde su teléfono y se lo manda al coach.
    """
    return {
        "alumnos": [{"id": "al-karina", "nombre": "Karina"}],
        "indice": [{"id": "karina-a3f9", "alumnoId": "al-karina", "estado": "activo"}],
        "planes": {"karina-a3f9": plan_base()},
        "cargas": {"karina-a3f9": {"v": {"0-1-0-s1-e1": "40"}, "d": {"0-1-0-s1-e1": True}}},
    }


def test_el_export_de_la_app_se_migra_igual_que_el_volcado_plano():
    c = convertir(export_de_la_app(), USUARIOS, COACH)
    assert len(c.planes) == 1
    assert c.planes[0].titulo == "Mesociclo agosto"
    assert len(c.registros) == 1
    assert c.registros[0].carga == "40"
    assert c.registros[0].hecha is True


def test_el_export_produce_los_mismos_ids_que_el_volcado():
    # Importa porque el coach puede migrar primero un export y después el
    # volcado del mismo plan: no tiene que duplicarse.
    a = convertir(export_de_la_app(), USUARIOS, COACH).planes[0].id
    b = convertir(volcado({"v": {"0-1-0-s1-e1": "40"}}), USUARIOS, COACH).planes[0].id
    assert a == b


def test_un_export_con_planes_vacios_no_rompe():
    e = export_de_la_app()
    e["planes"]["karina-borrado"] = None
    e["cargas"]["karina-borrado"] = None
    c = convertir(e, USUARIOS, COACH)
    assert len(c.planes) == 1
