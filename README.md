# MindFit · Rutinas

App de entrenamiento de la fuerza. El coach arma los mesociclos, cada alumno
entra con su link personal, carga los pesos serie por serie y se los manda al
coach por WhatsApp.

Un solo archivo HTML, sin build, sin dependencias. Se despliega arrastrándolo
a cualquier hosting estático.

---

## Qué hay en este repo

| Archivo | Qué es |
| --- | --- |
| `index.html` | **La app entera.** HTML, CSS y JavaScript en un solo archivo. |
| `vercel.json` | Cabeceras de caché y seguridad. Es lo que hace que actualizar la app no obligue a remandar los links. |
| `manifest.webmanifest` | Para que "Agregar a pantalla de inicio" se comporte como una app. |
| `icon-*.png` | Íconos de la app. |
| `supabase/migrations/` | El esquema nuevo, versionado: perfiles, planes, registros y las políticas RLS. Todavía **no** está en producción. |
| `supabase/tests/rls.sql` | Pruebas de las políticas: quién ve qué, y sobre todo qué **no** ve. |
| `packages/types/src/supabase.ts` | Tipos TypeScript generados desde el esquema. |
| `apps/worker/` | Los trabajos de fondo, en Python: migración de datos, backups, informes. La app **no** habla con esto. |
| `supabase/legado/01_esquema_actual.sql` | El SQL de la tabla que hoy está en producción. |
| `supabase/legado/02_esquema_relacional.sql` | El borrador del que salieron las migraciones. Queda como referencia. |
| `tests/smoke.mjs` | Pruebas automáticas en un navegador real. |
| `docs/ejemplos/api-store.js` | Ejemplo del backend propio (Etapa 2). No está activo. |
| `docs/version_anterior_v1.html` | La versión previa al rediseño, por las dudas. |
| **`HANDOFF.md`** | **Empezá por acá.** Arquitectura, diagnóstico y el camino por etapas. |

---

## Desplegar en Vercel

1. Subí este repo a GitHub.
2. En **vercel.com** → **Add New… → Project** → importá el repo.
3. **No toques nada** en la pantalla de configuración: Framework Preset queda
   en *Other*, sin build command. Es un sitio estático.
4. **Deploy**.

Te queda una dirección tipo `https://mindfit-rutinas.vercel.app`. Esa es la
app, y de ahí salen los links de los alumnos:

```
https://mindfit-rutinas.vercel.app/#karina
```

### Actualizar

`git push` a la rama principal. Vercel redespliega solo, la dirección no
cambia y **los links de los alumnos siguen funcionando**. Lo ven la próxima
vez que abren la app, sin borrar caché ni reinstalar nada — de eso se encarga
el `Cache-Control` de `vercel.json`.

---

## Conectar Supabase

Sin esto la app funciona igual, pero guarda en el navegador de cada uno: el
coach no ve lo que cargan los alumnos.

1. Creá un proyecto en **supabase.com** (región São Paulo).
2. **SQL Editor** → pegá `supabase/01_esquema_actual.sql` → **Run**.
3. **Project Settings → API Keys**: copiá la **Project URL** y la **clave
   pública** (`Publishable key`, o `anon public` en la solapa de claves
   heredadas).
4. En `index.html`, buscá `supabase:` cerca del principio y completá:

```js
supabase: { url: "https://xxxx.supabase.co", anonKey: "sb_publishable_..." },
```

5. `git push`.

Para confirmar que quedó bien: arriba a la derecha tiene que decir **NUBE**
con el puntito naranja. Si dice **ESTE CELULAR**, las claves no están bien
puestas.

> ⚠️ Esa clave queda visible dentro del `index.html`. Con la política actual,
> cualquiera que abra la app puede leer y escribir toda la base. Para tu grupo
> de alumnos es aceptable; para abrirla al público, no. Ver **Etapa 2** en
> `HANDOFF.md`.

---

## Modo coach

Al pie de la app, **Modo coach**, clave `mindfit` (está en `CFG.pinCoach`,
dentro de `index.html`). Habilita crear alumnos y mesociclos, editar
ejercicios y borrar.

No es seguridad: cualquiera que mire el código fuente la encuentra. Solo evita
que un alumno rompa algo sin querer.

---

## Pruebas

```bash
npm install
npm test
```

Abre la app en un Chromium de verdad y recorre los caminos que más duelen si
se rompen: cargar un peso, tildar una serie, cambiar de tema, crear y borrar
un mesociclo, y que todo siga ahí después de recargar.

Corré esto antes de cada `git push`.

---

## La base, en tu máquina

Desde ahora el esquema no se pega a mano en el SQL Editor: vive versionado en
`supabase/migrations/` y se prueba local antes de tocar la nube. Necesitás
Docker andando.

```bash
npm run db:start     # levanta Postgres local (la primera vez baja imágenes)
npm run db:reset     # borra y aplica todas las migraciones desde cero
npm run test:rls     # 28 pruebas de las políticas de acceso
npm run db:tipos     # regenera los tipos TS desde el esquema
npm run db:stop
```

`npm run test:rls` es el que importa. Simula sesiones de verdad —una alumna,
dos coaches que no se conocen, y alguien sin sesión— y verifica que cada uno
vea solo lo suyo. Corrélo cada vez que toques una política.

> Nada de esto toca tu proyecto de Supabase en la nube. El esquema nuevo se
> aplica allá recién en el cutover, y con los datos migrados. Hasta entonces
> producción sigue sobre `mindfit_store`, igual que siempre.

## Migrar los datos al esquema nuevo

Vive en `apps/worker/`. Los cuatro pasos, en orden, y ninguno toca producción
salvo el que dice que sí.

```bash
cd apps/worker
uv sync --extra dev
uv run pytest                                     # 24 pruebas de la conversión, sin base

uv run python -m mindfit_worker.volcar            # 1. baja una copia (SOLO LEE)
uv run python -m mindfit_worker.migrar --plantilla-alumnos   # 2. csv de mails a completar
uv run python -m mindfit_worker.migrar            # 3. ensayo: convierte e informa, no escribe
uv run python -m mindfit_worker.migrar --escribir # 4. en serio
uv run python -m mindfit_worker.verificar         # 5. ¿se perdió algo?
```

El paso 3 es el que hay que mirar con calma: imprime un aviso por cada cosa
que no pudo traducir limpio —claves rotas, pesos que apuntan a ejercicios que
ya no están, planes que quedaron en el índice sin documento—. Una migración
silenciosa es una migración en la que no se puede confiar.

El paso 5 compara el volcado contra la base, dato por dato, y sale con error
si falta un solo peso.

> El paso 2 necesita algo que la app vieja no tiene: **el mail de cada
> alumno**. El modelo actual los identifica por nombre (`#karina`), y Auth
> necesita un mail para mandar el link mágico. Por eso la migración no puede
> ser del todo automática: esa columna la completás vos.

⚠️ `apps/worker/datos/` tiene los datos reales de tus alumnos y está en el
`.gitignore`. Que siga ahí.
