-- ============================================================================
-- MindFit · Esquema RELACIONAL propuesto (Etapa 4)
-- ----------------------------------------------------------------------------
-- ⚠️ NO CORRER TODAVÍA. Esto es el destino, no el presente.
--
-- Es la propuesta para cuando el modelo de "un JSON gigante por mesociclo"
-- empiece a doler. El síntoma que te va a avisar: dos dispositivos escriben
-- pesos del mismo día casi al mismo tiempo y uno pisa al otro sin que nadie
-- se entere. Hoy eso pasa, porque cada guardado manda el documento entero.
--
-- La idea de fondo:
--   · El PLAN (días, bloques, ejercicios) lo escribe una sola persona, el
--     coach, y se lee mucho más de lo que se escribe → puede seguir siendo
--     un documento JSONB. No hay pelea por escribirlo.
--   · Los REGISTROS (el peso y las reps de cada serie) los escribe el alumno
--     mientras entrena, de a uno, desde cualquier dispositivo → esos sí van
--     como filas sueltas. Una fila por serie. Dos escrituras a series
--     distintas dejan de pisarse.
--
-- Este archivo asume que ya existe Supabase Auth (Etapa 3): cada alumno con
-- su usuario, y el coach con el suyo.
-- ============================================================================

-- ---------------------------------------------------------------- perfiles --
-- Extiende auth.users con lo que necesita la app. El rol decide qué puede
-- hacer cada uno; nada de PIN en el código.
create table perfiles (
  id       uuid primary key references auth.users(id) on delete cascade,
  nombre   text not null,
  rol      text not null default 'alumno' check (rol in ('alumno','coach')),
  coach_id uuid references perfiles(id),          -- de qué coach es este alumno
  creado   timestamptz default now()
);

-- ----------------------------------------------------------------- planes --
-- El mesociclo. La estructura (días → bloques → ejercicios) sigue siendo un
-- documento, porque se edita entero y de a una persona.
create table planes (
  id          uuid primary key default gen_random_uuid(),
  alumno_id   uuid not null references perfiles(id) on delete cascade,
  coach_id    uuid not null references perfiles(id),
  titulo      text not null,
  semanas     int  not null default 4 check (semanas between 1 and 12),
  ciclo_carga jsonb not null default '[[0,1,2],[3]]',
  estructura  jsonb not null,                     -- los días, tal cual hoy
  estado      text not null default 'activo' check (estado in ('activo','archivado')),
  creado      timestamptz default now(),
  actualizado timestamptz default now()
);
create index on planes (alumno_id, estado);

-- -------------------------------------------------------------- registros --
-- ACÁ está el cambio de fondo: una fila por serie, en vez de un JSON con
-- todas las series del mesociclo.
create table registros (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references planes(id) on delete cascade,
  alumno_id   uuid not null references perfiles(id) on delete cascade,

  -- coordenadas de la serie dentro del plan
  dia         int  not null,
  bloque      int  not null,
  ejercicio   int  not null,
  semana      int  not null,
  serie       int  not null,

  -- lo que efectivamente hizo
  carga       text,              -- "40", "corporal", "roja" (texto: hay bandas)
  reps        text,              -- "8", "20\" x lado"
  hecha       boolean not null default false,
  heredada    boolean not null default false,   -- vino de la semana anterior

  actualizado timestamptz default now(),

  unique (plan_id, dia, bloque, ejercicio, semana, serie)
);
create index on registros (plan_id, semana, dia);
create index on registros (alumno_id, actualizado desc);

-- La restricción unique de arriba es la que permite escribir con "upsert":
-- la app manda una serie y la base decide si es alta o modificación. Dos
-- alumnos, o dos dispositivos, escribiendo series distintas nunca se pisan.

-- ------------------------------------------------------------- biblioteca --
create table ejercicios (
  id       uuid primary key default gen_random_uuid(),
  coach_id uuid references perfiles(id) on delete cascade,
  nombre   text not null,
  video    text,
  carga    text not null default 'kg' check (carga in ('kg','corporal','banda')),
  creado   timestamptz default now(),
  unique (coach_id, nombre)
);

-- ============================================================================
-- SEGURIDAD DE VERDAD
-- Con esto, la clave pública deja de ser una llave maestra: cada quien ve y
-- toca solo lo suyo, y lo garantiza la base, no el código del navegador.
-- ============================================================================

alter table perfiles   enable row level security;
alter table planes     enable row level security;
alter table registros  enable row level security;
alter table ejercicios enable row level security;

-- Cada uno ve su perfil; el coach ve el de sus alumnos.
create policy "perfil propio" on perfiles for select to authenticated
  using (id = auth.uid() or coach_id = auth.uid());

-- El alumno ve sus planes. El coach ve y edita los que él creó.
create policy "el alumno ve lo suyo" on planes for select to authenticated
  using (alumno_id = auth.uid() or coach_id = auth.uid());

create policy "solo el coach arma planes" on planes for insert to authenticated
  with check (coach_id = auth.uid());

create policy "solo el coach edita planes" on planes for update to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

create policy "solo el coach borra planes" on planes for delete to authenticated
  using (coach_id = auth.uid());

-- Los registros los escribe el alumno mientras entrena; el coach también
-- puede corregirlos.
create policy "registros visibles" on registros for select to authenticated
  using (
    alumno_id = auth.uid()
    or exists (select 1 from planes p where p.id = plan_id and p.coach_id = auth.uid())
  );

create policy "registros editables" on registros for all to authenticated
  using (
    alumno_id = auth.uid()
    or exists (select 1 from planes p where p.id = plan_id and p.coach_id = auth.uid())
  )
  with check (
    alumno_id = auth.uid()
    or exists (select 1 from planes p where p.id = plan_id and p.coach_id = auth.uid())
  );

-- La biblioteca de ejercicios: la lee cualquiera logueado, la escribe su dueño.
create policy "biblioteca legible" on ejercicios for select to authenticated using (true);
create policy "biblioteca del coach" on ejercicios for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());


-- ============================================================================
-- NOTA SOBRE RENDIMIENTO DE LAS POLÍTICAS
-- ----------------------------------------------------------------------------
-- Cuando estas tablas crezcan, conviene envolver auth.uid() en un subselect:
--
--   using (alumno_id = (select auth.uid()))
--
-- Postgres evalúa el subselect una sola vez por consulta en vez de una vez
-- por fila. Con decenas de alumnos no se nota; con miles, sí.
--
-- Y siempre: indexar las columnas que aparecen en las políticas
-- (alumno_id, coach_id, plan_id). Ya están indexadas arriba.
-- ============================================================================
