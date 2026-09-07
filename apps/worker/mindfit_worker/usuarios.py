"""Da de alta a los alumnos con mail y contraseña.

Mientras no haya dominio propio ni SMTP configurado, el mail no sirve para
mandar nada: es solo el nombre con el que cada uno entra. La contraseña la
genera esto y se la pasa el coach por WhatsApp.

    uv run python -m mindfit_worker.usuarios --listar
    uv run python -m mindfit_worker.usuarios --alta alumnos.csv
    uv run python -m mindfit_worker.usuarios --clave karina@mindfit.local

El csv de alta lleva `nombre,email` por fila. Si el mail queda vacío se arma
uno con el nombre y el dominio interno, porque a nadie le va a llegar nada:

    nombre,email
    Karina,
    Anita,anita@gmail.com
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import pathlib
import secrets
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

import psycopg

from .entorno import cargar
from .migrar import LOCAL

# Un dominio que no existe y nunca va a existir. Deja claro de un vistazo que
# esa dirección no recibe mails, en vez de aparentar una casilla real.
DOMINIO_INTERNO = "mindfit.local"

# Palabras cortas, sin acentos ni ces con cedilla, fáciles de dictar por
# teléfono y de tipear en un celular con las manos llenas de magnesio.
PALABRAS = """
banco barra pesa disco cinta salto pausa fuerza envion press remo sentadilla
puente plancha camilla polea banda goma soga cono step bosu kettle mancuerna
lunes martes jueves viernes sabado enero marzo abril junio julio agosto
tigre puma lobo halcon ciervo bisonte oso lince zorro condor jaguar aguila
rojo verde azul negro blanco gris dorado plata bronce cobre
norte sur este oeste cumbre valle rio lago monte campo bosque duna
firme sereno rapido lento suave duro largo corto alto bajo ligero pesado
uno dos tres cuatro cinco seis siete ocho nueve diez
""".split()


def clave_nueva() -> str:
    """Tres palabras y dos dígitos: `tigre-cumbre-firme-47`.

    Se elige una frase y no una ristra de caracteres al azar porque hay que
    dictarla por WhatsApp y volver a tipearla en un teléfono. Con esta lista
    son unas 10^8 combinaciones: alcanza para un grupo cerrado con el límite
    de intentos de Supabase enfrente, y no para una app abierta al público.
    Cuando haya recuperación por mail, esto se reemplaza por lo que elija cada
    uno.
    """
    return "-".join(secrets.choice(PALABRAS) for _ in range(3)) + "-" + f"{secrets.randbelow(90) + 10}"


def sin_acentos(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def mail_interno(nombre: str) -> str:
    limpio = "".join(c for c in sin_acentos(nombre).lower() if c.isalnum())
    return f"{limpio}@{DOMINIO_INTERNO}"


class Admin:
    def __init__(self) -> None:
        self.url = os.environ["SUPABASE_URL"].rstrip("/")
        self.clave = os.environ["SUPABASE_SECRET_KEY"]

    def _pedir(self, ruta: str, datos=None, metodo="GET"):
        req = urllib.request.Request(
            f"{self.url}/auth/v1/{ruta}",
            data=json.dumps(datos).encode() if datos else None,
            headers={"apikey": self.clave, "Authorization": f"Bearer {self.clave}",
                     "Content-Type": "application/json"},
            method=metodo)
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)

    def buscar(self, email: str) -> dict | None:
        r = self._pedir("admin/users?filter=" + urllib.parse.quote(email))
        for u in r.get("users", []):
            if (u.get("email") or "").lower() == email:
                return u
        return None

    def crear(self, email: str, nombre: str, clave: str) -> dict:
        # email_confirm evita el mail de verificación, que no llegaría a
        # ninguna parte: estas direcciones no existen.
        return self._pedir("admin/users", {
            "email": email, "password": clave, "email_confirm": True,
            "user_metadata": {"nombre": nombre},
        }, "POST")

    def cambiar_clave(self, uid: str, clave: str) -> dict:
        return self._pedir(f"admin/users/{uid}", {"password": clave}, "PUT")


def alta(ruta: pathlib.Path, coach_email: str) -> int:
    admin = Admin()
    with ruta.open(encoding="utf-8") as f:
        filas = [r for r in csv.DictReader(f) if (r.get("nombre") or "").strip()]

    if not filas:
        print(f"{ruta} no tiene ninguna fila con nombre.", file=sys.stderr)
        return 1

    with psycopg.connect(os.getenv("DATABASE_URL", LOCAL), connect_timeout=20) as con, con.cursor() as cur:
        cur.execute("""select p.id from public.perfiles p join auth.users u on u.id = p.id
                       where lower(u.email) = %s and p.rol = 'coach'""", (coach_email,))
        fila = cur.fetchone()
        if not fila:
            print(f"No existe un coach con el mail {coach_email}.", file=sys.stderr)
            return 1
        coach_id = fila[0]

        nuevos: list[tuple[str, str, str]] = []
        for r in filas:
            nombre = r["nombre"].strip()
            email = (r.get("email") or "").strip().lower() or mail_interno(nombre)
            clave = clave_nueva()

            existente = admin.buscar(email)
            if existente:
                admin.cambiar_clave(existente["id"], clave)
                uid = existente["id"]
                print(f"  · {nombre}: ya existía, se le puso una contraseña nueva")
            else:
                uid = admin.crear(email, nombre, clave)["id"]
                print(f"  · {nombre}: creado")

            # El trigger arma el perfil; acá se lo cuelga del coach y se le
            # asegura el nombre, que en un alta previa pudo quedar distinto.
            cur.execute("""update public.perfiles
                           set coach_id = %s, nombre = %s
                           where id = %s and rol = 'alumno'""", (coach_id, nombre, uid))
            nuevos.append((nombre, email, clave))
        con.commit()

    print("\n" + "─" * 58)
    print("Para mandarle a cada uno. Las contraseñas no se pueden volver a ver:")
    print("─" * 58)
    for nombre, email, clave in nuevos:
        print(f"\n{nombre}")
        print(f"  mail:       {email}")
        print(f"  contraseña: {clave}")
    print("\nSi alguien la pierde: --clave <email> genera otra.")
    return 0


# Las cuentas que usan las pruebas de punta a punta.
#
# Existen porque la suite le cambia la contraseña a quien use para poder
# entrar, y hacérselo a Tomás o a una alumna los deja afuera sin que nadie se
# entere. Ya pasó dos veces.
COACH_PRUEBA = "e2e-coach@mindfit.local"
ALUMNO_PRUEBA = "e2e-alumno@mindfit.local"
PLAN_PRUEBA = "Prueba · Full body"


def cuentas_de_prueba() -> int:
    """Deja listas las cuentas de las pruebas. Se puede correr muchas veces."""
    admin = Admin()

    coach = admin.buscar(COACH_PRUEBA)
    if not coach:
        coach = admin.crear(COACH_PRUEBA, "Coach de prueba", clave_nueva())
        print(f"  · creado {COACH_PRUEBA}")
    alumno = admin.buscar(ALUMNO_PRUEBA)
    if not alumno:
        alumno = admin.crear(ALUMNO_PRUEBA, "Alumno de prueba", clave_nueva())
        print(f"  · creado {ALUMNO_PRUEBA}")

    with psycopg.connect(os.getenv("DATABASE_URL", LOCAL), connect_timeout=20) as con, con.cursor() as cur:
        cur.execute("select public.promover_a_coach(%s)", (coach["id"],))
        cur.execute("""update public.perfiles set coach_id = %s, nombre = 'Alumno de prueba'
                       where id = %s""", (coach["id"], alumno["id"]))

        # Un plan para que las pruebas tengan qué abrir. Se copia la estructura
        # de un mesociclo real: si fuera inventada, las pruebas pasarían con
        # una forma de datos que no existe en producción.
        cur.execute("""select estructura, semanas, ciclo_carga from public.planes
                       where origen is not null order by creado limit 1""")
        modelo = cur.fetchone()
        if not modelo:
            print("No hay ningún plan del que copiar la estructura.", file=sys.stderr)
            return 1

        cur.execute("""insert into public.planes
                         (alumno_id, coach_id, titulo, semanas, ciclo_carga, estructura, origen)
                       values (%s,%s,%s,%s,%s,%s,'e2e')
                       on conflict (origen) where origen is not null do update set
                         alumno_id = excluded.alumno_id, coach_id = excluded.coach_id,
                         estructura = excluded.estructura""",
                    (alumno["id"], coach["id"], PLAN_PRUEBA,
                     modelo[1], json.dumps(modelo[2]), json.dumps(modelo[0])))
        con.commit()

    print(f"\n✓ listas. Las pruebas manejan sus contraseñas solas.")
    print(f"  coach:  {COACH_PRUEBA}")
    print(f"  alumno: {ALUMNO_PRUEBA}")
    print(f"  plan:   {PLAN_PRUEBA}")
    return 0


def main(argv: list[str] | None = None) -> int:
    cargar()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--alta", metavar="CSV", type=pathlib.Path,
                    help="da de alta los alumnos de un csv con nombre,email")
    ap.add_argument("--clave", metavar="EMAIL", help="le genera una contraseña nueva a alguien")
    ap.add_argument("--listar", action="store_true", help="muestra quién está dado de alta")
    ap.add_argument("--prueba", action="store_true",
                    help="arma las cuentas que usan las pruebas e2e")
    ap.add_argument("--coach", default=os.getenv("COACH_EMAIL", ""),
                    help="el mail del coach al que se cuelgan los alumnos")
    args = ap.parse_args(argv)

    if args.clave:
        admin = Admin()
        email = args.clave.strip().lower()
        u = admin.buscar(email)
        if not u:
            print(f"No existe ningún usuario con el mail {email}.", file=sys.stderr)
            return 1
        clave = clave_nueva()
        admin.cambiar_clave(u["id"], clave)
        print(f"{email}\n  contraseña: {clave}")
        return 0

    if args.prueba:
        return cuentas_de_prueba()

    if args.alta:
        if not args.alta.exists():
            print(f"No encuentro {args.alta}.", file=sys.stderr)
            return 1
        return alta(args.alta, args.coach.strip().lower())

    with psycopg.connect(os.getenv("DATABASE_URL", LOCAL), connect_timeout=20) as con, con.cursor() as cur:
        cur.execute("""select p.nombre, p.rol, u.email,
                              (select count(*) from public.planes pl where pl.alumno_id = p.id)
                       from public.perfiles p join auth.users u on u.id = p.id
                       order by p.rol desc, p.nombre""")
        filas = cur.fetchall()

    print(f"  {'nombre':<12} {'rol':<7} {'mail':<32} planes")
    for nombre, rol, email, planes in filas:
        print(f"  {nombre:<12} {rol:<7} {email:<32} {planes}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
