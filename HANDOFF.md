# MindFit · Handoff técnico

Este documento explica **qué es la app hoy**, **qué le falta para ser un
producto profesional** y **en qué orden conviene construirlo**.

Está escrito para que lo puedas seguir vos, o para dárselo a un programador
que se sume sin conocer nada del proyecto.

Una advertencia de arranque, porque es la más importante de todas: casi nada
de lo que está en las etapas 2 en adelante te hace falta hoy. Con cinco
alumnos que conocés por nombre, la app actual es suficiente y hasta razonable.
La lista larga que sigue no es una lista de deudas urgentes: es un mapa para
cuando el proyecto crezca. **Construir de más, antes de tiempo, es la forma
más común de matar un proyecto que funciona.**

---

## 1. Qué es esto hoy

Una aplicación web de un solo archivo. `index.html` tiene adentro el HTML, el
CSS y unas 2.000 líneas de JavaScript sin frameworks ni build.

Eso, que suena precario, es en realidad la decisión más acertada del proyecto:

- Se despliega arrastrando un archivo. No hay `npm install` que se rompa, ni
  versiones de Node, ni pipeline que mantener.
- Se abre en cualquier navegador, incluso desde el escritorio sin servidor.
- Dentro de dos años lo vas a poder abrir y entender. Un proyecto con 400
  dependencias, no.

El costo aparece cuando el archivo crece o cuando entran varias personas a
tocarlo a la vez. Todavía no estás ahí.

### El mapa, en una imagen

```
┌─────────────────────────────────────────────────────────────┐
│  index.html                                                 │
│                                                             │
│  CFG            ← teléfono del coach, PIN, claves           │
│  GUIA           ← el texto de "Cómo progresar"              │
│  ─────────────────────────────────────────────────────────  │
│  CAPA store     ← Local · Supabase · AppsScript · Claude    │
│                   los cuatro cumplen read / write / watch   │
│  ─────────────────────────────────────────────────────────  │
│  BIBLIOTECA     ← ~75 ejercicios con su link de video       │
│  MODELO         ← alumnos, planes, series, propagación      │
│  MIGRACIONES    ← arreglan datos viejos al abrirlos         │
│  ─────────────────────────────────────────────────────────  │
│  RENDER         ← 5 pantallas, todo con innerHTML           │
│  MODALES        ← alta y edición                            │
│  CRONÓMETRO     ← descansos entre series                    │
│  SEMILLA        ← los planes de agosto, para arrancar       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │  Supabase · mindfit_store     │
              │  una tabla clave → JSON       │
              └───────────────────────────────┘
```

### La capa `store`, que es lo mejor que tiene

Toda la app habla con los datos a través de tres funciones:

```js
store.read(clave)          // traer
store.write(clave, valor)  // guardar
store.watch(clave, cb)     // avisame si cambia
```

Hay cuatro implementaciones que cumplen ese contrato: `localStorage`,
Supabase por REST, Google Apps Script y la base de Claude. `elegirBackend()`
decide cuál usar al arrancar, y **ninguna pantalla sabe cuál está activa**.

Guardá esto, porque es la clave de todo lo que viene después: cambiar de
backend —incluso poner un servidor propio en el medio— es escribir un objeto
nuevo con esas tres funciones. No hay que tocar ni una pantalla.

### El modelo de datos

Cinco claves, cada una con un documento JSON entero:

| Clave | Qué guarda |
|---|---|
| `alumnos` | La lista de alumnos |
| `indice` | Los mesociclos, con su título y estado, sin el contenido |
| `biblioteca` | Los ejercicios que agregó el coach |
| `plan:<id>` | Un mesociclo completo: días → bloques → ejercicios |
| `cargas:<id>` | Los pesos y reps de ese mesociclo |

Los pesos se guardan con una clave larga que codifica la posición exacta:

```
0-1-3-s2-e1   →  día 0, bloque 1, ejercicio 3, semana 2, serie 1
```

### Cómo entra cada alumno

El link lleva el alumno al final: `.../#karina`. Con eso la app arranca
directo en su rutina y esconde todo lo del coach.

**Esto no es seguridad.** Es ruteo. Cualquiera puede escribir otro nombre en
la barra y entrar. Lo aclaro acá porque es fácil confundirlo con una
protección, y no lo es.

### Las migraciones

Cuando cambia la forma de los datos, la app los arregla sola al abrirlos.
`plan.cargaAuto` guarda en qué versión está cada plan, y `migrarTiposDeCarga()`
aplica lo que falte. Hoy va por la versión 5.

Es una solución honesta para una app sin backend, y funcionó bien. Tiene un
límite que conviene tener presente: si un alumno abre la app con una versión
vieja en caché **después** de que otro corrió una migración, puede reescribir
los datos con la forma anterior. Con el `Cache-Control` de `vercel.json` la
ventana es de segundos, pero existe.

---

## 2. Diagnóstico honesto

Lo que sigue no está ordenado por dificultad sino por **cuándo te va a
morder**.

### 2.1 · La clave abre toda la base 🔴

La clave pública de Supabase viaja dentro del `index.html`, y la política que
tenemos hoy le da permiso para todo. Cualquiera que abra la app puede, con la
consola del navegador, leer los datos de todos los alumnos o borrar la tabla.

**Cuándo importa:** el día que el link salga de tu círculo de confianza. Con
cinco alumnos conocidos, el riesgo real es bajo. Si la ofrecés a desconocidos,
es inaceptable.

**Solución:** Etapa 2 (rápida) o Etapa 3 (definitiva).

### 2.2 · Las escrituras se pisan 🟠

Cada vez que se guarda un peso, se manda **el documento entero** de pesos del
mesociclo. Si dos dispositivos guardan casi al mismo tiempo, el segundo pisa
al primero completo, sin aviso.

**Cuándo importa:** cuando vos corregís pesos desde tu celular mientras el
alumno entrena. Hoy es raro; con más alumnos deja de serlo.

**Solución:** Etapa 4. Una fila por serie en vez de un JSON gigante.

### 2.3 · El PIN del coach es decorativo 🟠

`pinCoach: "mindfit"` está en el código fuente. Cualquiera lo encuentra en
diez segundos.

Está bien como está **si asumís que es un cartel de "no pasar" y no una
cerradura**. Pero no lo confundas: hoy cualquier alumno puede entrar en modo
coach y borrar mesociclos de otro.

### 2.4 · Consulta cada 20 segundos en vez de escuchar 🟡

La sincronización pregunta "¿cambió algo?" cada 20-25 segundos. Funciona, pero
gasta batería y datos, y agrega hasta 25 segundos de demora.

**Solución:** Supabase Realtime. Es reemplazar la función `watch` de un
backend. Media hora de trabajo.

### 2.5 · Sin internet no guarda en la nube 🟡

Hay copia local, y eso salva la sesión. Pero **no hay cola de reintento**: si
el alumno carga pesos sin señal, quedan en el celular y no suben solos cuando
vuelve la conexión.

En un gimnasio de subsuelo esto pasa seguido.

**Solución:** Etapa 5.

### 2.6 · Sin build, sin módulos, sin tipos 🟡

2.000 líneas en un archivo. Hoy se navega bien porque está ordenado por
secciones y comentado. A las 4.000 líneas deja de ser cierto.

**No lo toques todavía.** El día que te duela, vas a saber.

### 2.7 · Sin backups automáticos 🟠

Existe "Exportar copia de seguridad", pero hay que acordarse. El plan gratis
de Supabase **no incluye backups automáticos**.

**Solución:** Etapa 1. Es de lo más barato y de lo que más te puede salvar.

### 2.8 · Sin registro de errores

Si a un alumno se le rompe algo, no te enterás. Te lo cuenta por WhatsApp, o
no te lo cuenta.

---

## 3. El camino, por etapas

Cada etapa se sostiene sola. Podés parar en cualquiera.

### Etapa 0 — Lo que ya tenés ✅

Un archivo en Vercel, Supabase con una tabla, links por alumno, cronómetro,
tema claro/oscuro, borrado con confirmación.

**Alcanza hasta:** unos 20 alumnos que confiás.

---

### Etapa 1 — Higiene · *una tarde* 🎯 **empezá acá**

Lo que más resultado da por hora invertida.

**1. Cabeceras de caché** — ya está hecho, en `vercel.json`. Es lo que hace
que puedas actualizar sin remandar links.

**2. La app como app** — ya está hecho: `manifest.webmanifest` e íconos. Al
agregarla a la pantalla de inicio abre sin barra de navegador, con su nombre y
su ícono.

**3. Backup automático semanal.** Un cron de Vercel que exporta la base a un
archivo. Diez líneas:

```js
// api/backup.js  +  en vercel.json: "crons":[{"path":"/api/backup","schedule":"0 6 * * 1"}]
export default async function handler(req, res) {
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/mindfit_store?select=*`, {
    headers: { apikey: process.env.SUPABASE_SECRET_KEY,
               Authorization: `Bearer ${process.env.SUPABASE_SECRET_KEY}` }
  });
  const filas = await r.json();
  // mandarlo a tu mail, a un Storage de Supabase, o a donde prefieras
  res.status(200).json({ ok: true, filas: filas.length });
}
```

**4. Sacar el teléfono y el PIN del código** y pasarlos a variables de entorno
de Vercel. Requiere el paso siguiente para tener sentido completo, pero el PIN
al menos deja de estar en GitHub.

**Cómo sabés que terminaste:** subís un cambio, y el celular de un alumno lo
ve sin que le digas nada.

---

### Etapa 2 — Backend propio · *un fin de semana* 🔐

**El salto más importante de todos.** Acá es donde esto pasa de "una página
que habla con una base" a una arquitectura de verdad.

Hoy:

```
celular ──── clave que abre todo ────► Supabase
```

Después:

```
celular ──── token del alumno ────► /api/store ──── clave secreta ────► Supabase
                                    (en Vercel)
```

La clave secreta vive como variable de entorno del servidor y **nunca llega al
celular**. La función decide qué puede tocar cada uno: un alumno solo sus
planes y sus pesos.

El link deja de ser `#karina` y pasa a ser `?t=karina.9f2c1a...`, donde la
segunda parte es una firma que solo el servidor puede generar. Adivinar un
nombre deja de alcanzar.

El código completo y comentado está en **`docs/ejemplos/api-store.js`**.

Y acá se cobra el diseño de la capa `store`: del lado de la app son unas 20
líneas, un backend más que cumple `read` / `write` / `watch`. **Cero cambios
en las pantallas.**

⚠️ Esto sí cambia los links de los alumnos. Hacelo junto con un mesociclo
nuevo, cuando les mandás el link igual.

**Cómo sabés que terminaste:** abrís el código fuente de la app publicada y no
encontrás ninguna clave que sirva para nada.

---

### Etapa 3 — Cuentas de verdad · *unos días* 👤

Supabase Auth: cada alumno con su usuario (por mail con link mágico, sin
contraseña que olvidar), y vos con el tuyo marcado como coach.

Las reglas de acceso pasan a estar **en la base de datos**, no en el código.
Aunque alguien encuentre un agujero en la app, la base le sigue diciendo que
no.

El SQL está escrito en `supabase/02_esquema_relacional.sql`.

**Cuándo:** cuando empieces a cobrar, o cuando los alumnos sean gente que no
conocés.

---

### Etapa 4 — Los registros como filas · *unos días* 🗃️

Fin del "pisar todo el documento". Una fila por serie, y las escrituras a
series distintas dejan de competir.

Se gana además: consultar de verdad ("¿cuánto levantaba Karina en sentadilla
en marzo?" pasa a ser una consulta, no recorrer todos los JSON), estadísticas
reales y gráficos de progreso.

El plan puede seguir siendo un documento JSON: lo escribe una sola persona.

⚠️ Requiere migrar los datos existentes. Escribí el script de migración
**antes** de tocar el esquema, y probalo sobre una copia.

---

### Etapa 5 — Oficio · *continuo* 🔧

Cuando el proyecto se lo gane, no antes:

- **Realtime** en vez de consultar cada 20 segundos.
- **Service worker** con cola de reintento: se carga sin señal y sube solo.
- **Vite + módulos**: partir el archivo en `store/`, `modelo/`, `ui/`.
- **Tests en CI**: ya hay pruebas en `tests/`; falta que corran en cada push.
  El workflow está en `.github/workflows/tests.yml`.
- **Sentry** para enterarte de los errores sin que te los cuenten.

---

## 4. Recetario

### Actualizar la app

```bash
npm test                 # que no se haya roto nada
git add -A && git commit -m "qué cambió" && git push
```

Vercel redespliega solo. Los links siguen iguales.

### Restaurar una copia

Modo coach → **Importar copia** → pegás el texto. Reemplaza todo.

### Ver qué hay en la base

Supabase → **Table Editor** → `mindfit_store`. O el SQL Editor con las
consultas que están al final de `supabase/01_esquema_actual.sql`.

### Si algo falla

1. ¿Arriba a la derecha dice **NUBE** o **ESTE CELULAR**? Si dice ESTE
   CELULAR, la app no está viendo Supabase: revisá las claves.
2. Consola del navegador (F12) → pestaña Console.
3. Supabase → **Logs** → API.
4. Vercel → **Deployments** → el último → **Runtime Logs**.

---

## 5. Decisiones tomadas, y por qué

Para que no las deshagas sin querer.

**Un solo archivo, sin build.** Se despliega arrastrándolo y se puede leer
entero. Se parte cuando duela, no antes.

**La capa `store` con cuatro backends.** Es lo que hace que las etapas 2 y 4
sean baratas. No la saques.

**Las notas de bloque guardan números, no texto.** El texto "3 series del
circuito" antes se *parseaba* para saber cuántas series mostrar. Ahora el
número está guardado aparte y el texto es libre. Si alguna vez volvés a leer
configuración desde un texto que ve el usuario, vas a repetir el bug.

**Migraciones con `cargaAuto`.** Cada plan sabe en qué versión está. Cuando
cambies la forma de los datos: subí el número, agregá el paso, y **nunca**
asumas que un plan viejo tiene los campos nuevos.

**Guardado con retardo, más vaciado al ocultarse.** Se espera medio segundo
para no escribir en cada tecla. Si la página se oculta antes —el alumno
bloquea el celular apenas carga el peso— se guarda igual, en el acto. Este bug
existió y costaba un peso perdido por serie; está cubierto por una prueba.

**El PIN no es seguridad.** Es un cartel. Tratalo como tal hasta la Etapa 2.

---

## 6. Si contratás a alguien

Lo que conviene pedirle, en orden:

1. **Etapa 2 completa** — la función `/api/store`, los tokens firmados y las
   variables de entorno. Es acotado, se puede revisar, y arregla el problema
   más serio.
2. **Backup automático** — media hora.
3. **Realtime** — media hora.

Lo que **no** conviene pedirle todavía: reescribirla en React o Next.js. No
resuelve ninguno de los problemas de la lista y te deja con un proyecto que
necesita mantenimiento de dependencias para siempre. Si algún día se reescribe,
que sea porque la app creció tanto que el archivo único se volvió inmanejable
—y para entonces vas a tener claro qué necesitás.

Una señal para elegir: si alguien mira este código y lo primero que dice es
"hay que rehacerlo con un framework" sin preguntar cuántos alumnos tenés,
buscá otra persona.
