# MindFit · Rutinas

App de entrenamiento de la fuerza. El coach arma los mesociclos, cada alumno
entra con su link personal, carga los pesos serie por serie y se los manda al
coach por WhatsApp.

Un solo archivo HTML, sin build, sin dependencias. Se despliega arrastrándolo
a cualquier hosting estático.

---

## Qué hay en este repo

| Archivo | Qué es |
|---|---|
| `index.html` | **La app entera.** HTML, CSS y JavaScript en un solo archivo. |
| `vercel.json` | Cabeceras de caché y seguridad. Es lo que hace que actualizar la app no obligue a remandar los links. |
| `manifest.webmanifest` | Para que "Agregar a pantalla de inicio" se comporte como una app. |
| `icon-*.png` | Íconos de la app. |
| `supabase/01_esquema_actual.sql` | El SQL que se corre una vez al crear el proyecto de Supabase. |
| `supabase/02_esquema_relacional.sql` | El esquema propuesto para más adelante. **No correr todavía.** |
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
