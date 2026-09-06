-- ============================================================================
-- MindFit · Planes, registros y biblioteca de ejercicios
-- ----------------------------------------------------------------------------
-- El cambio de fondo respecto de `mindfit_store`:
--
--   · El PLAN (días → bloques → ejercicios) lo escribe una sola persona, el
--     coach, y se lee mucho más de lo que se escribe → sigue siendo un
--     documento JSONB. No hay pelea por escribirlo.
--   · Los REGISTROS (peso y reps de cada serie) los escribe el alumno mientras
--     entrena, de a uno, desde cualquier dispositivo → una fila por serie.
--     Dos escrituras a series distintas dejan de pisarse.
--
-- Esto cierra el punto 2.2 del HANDOFF: hoy cada guardado manda el documento
-- entero de pesos y el último en escribir borra lo del anterior.
-- ============================================================================

-- ----------------------------------------------------------------- planes --
create table if not exists public.planes (
  id          uuid primary key default gen_random_uuid(),
  alumno_id   uuid not null references public.perfiles(id) on delete cascade,
  coach_id    uuid not null references public.perfiles(id) on delete cascade,
  titulo      text not null,
  semanas     int  not null default 4 check (semanas between 1 and 12),
  ciclo_carga jsonb not null default '[[0,1,2],[3]]'::jsonb,
  estructura  jsonb not null default '[]'::jsonb,     -- los días, tal cual hoy
  estado      text not null default 'activo' check (estado in ('activo','archivado')),
  origen      text,                                    -- la clave vieja, ej "plan:a3f9"
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

create index if not exists planes_alumno_estado_idx on public.planes (alumno_id, estado);
create index if not exists planes_coach_idx         on public.planes (coach_id);
create unique index if not exists planes_origen_idx on public.planes (origen) where origen is not null;

drop trigger if exists planes_tocar on public.planes;
create trigger planes_tocar
  before update on public.planes
  for each row execute function public.tocar_actualizado();

-- -------------------------------------------------------------- registros --
-- Una fila por serie. Las cinco coordenadas son las mismas que hoy viajan
-- codificadas en la clave `0-1-3-s2-e1` (día 0, bloque 1, ejercicio 3,
-- semana 2, serie 1).
create table if not exists public.registros (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.planes(id) on delete cascade,
  alumno_id   uuid not null references public.perfiles(id) on delete cascade,

  -- dia/bloque/ejercicio/semana son posiciones de array, 0-based, igual que
  -- hoy dentro del index.html. `serie` es la única 1-based, porque es la que
  -- el alumno ve escrita en la pantalla.
  dia         int not null check (dia       >= 0),
  bloque      int not null check (bloque    >= 0),
  ejercicio   int not null check (ejercicio >= 0),
  semana      int not null check (semana    >= 0),
  serie       int not null check (serie     >= 1),   -- 1-based: "serie 1"

  -- Texto y no numérico a propósito: hay bandas ("roja"), peso corporal
  -- ("corporal") y reps por lado ('20" x lado').
  carga       text,
  reps        text,
  hecha       boolean not null default false,
  heredada    boolean not null default false,   -- vino de la semana anterior

  actualizado timestamptz not null default now(),

  -- Es lo que permite escribir con upsert: la app manda una serie y la base
  -- decide si es alta o modificación.
  unique (plan_id, dia, bloque, ejercicio, semana, serie)
);

create index if not exists registros_plan_semana_dia_idx on public.registros (plan_id, semana, dia);
create index if not exists registros_alumno_fecha_idx    on public.registros (alumno_id, actualizado desc);

drop trigger if exists registros_tocar on public.registros;
create trigger registros_tocar
  before update on public.registros
  for each row execute function public.tocar_actualizado();

-- ------------------------------------------------------------ ejercicios --
-- `coach_id is null` = biblioteca base, la que hoy viene dentro del
-- index.html. Cada coach puede sumar los suyos encima.
create table if not exists public.ejercicios (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid references public.perfiles(id) on delete cascade,
  nombre      text not null,
  video       text,
  carga       text not null default 'kg' check (carga in ('kg','corporal','banda')),
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- Dos índices y no un `unique (coach_id, nombre)`: en Postgres NULL nunca es
-- igual a NULL, así que esa restricción no cubriría la biblioteca base.
create unique index if not exists ejercicios_coach_nombre_idx
  on public.ejercicios (coach_id, lower(nombre)) where coach_id is not null;
create unique index if not exists ejercicios_base_nombre_idx
  on public.ejercicios (lower(nombre)) where coach_id is null;

drop trigger if exists ejercicios_tocar on public.ejercicios;
create trigger ejercicios_tocar
  before update on public.ejercicios
  for each row execute function public.tocar_actualizado();

-- ---------------------------------------------------------- plan_series ---
-- Cuántas series tiene un ejercicio en una semana dada.
--
-- Hoy esto vive en `cargas.n`, el quinto mapa del documento de cargas, y se
-- mueve con los botones "+ serie" / "− serie". No es un registro de lo que
-- hizo el alumno sino configuración del plan, así que no entra en `registros`:
-- sin esta tabla, migrar perdería las series que alguien agregó a mano.
--
-- Solo existe la fila cuando hay override. Si no hay, la cantidad sale de las
-- reps escritas ("8x3" = 3 series), como calcula seriesDe() en la app.
create table if not exists public.plan_series (
  plan_id   uuid not null references public.planes(id) on delete cascade,
  dia       int  not null check (dia       >= 0),
  bloque    int  not null check (bloque    >= 0),
  ejercicio int  not null check (ejercicio >= 0),
  semana    int  not null check (semana    >= 0),
  series    int  not null check (series between 1 and 20),
  primary key (plan_id, dia, bloque, ejercicio, semana)
);
