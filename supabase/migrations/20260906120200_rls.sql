-- ============================================================================
-- MindFit · Seguridad de verdad (RLS)
-- ----------------------------------------------------------------------------
-- Acá se cierra el punto 2.1 del HANDOFF: hoy la clave pública viaja dentro
-- del index.html y abre la base entera. Con esto, esa misma clave deja de
-- servir para nada por sí sola — quien no tiene sesión no ve una fila, y
-- quien la tiene ve solo lo suyo. Lo garantiza Postgres, no el navegador.
--
-- El PIN `mindfit` deja de ser el control de acceso: el rol vive en la base.
--
-- Dos detalles de forma que se repiten abajo, y el porqué:
--
--   · `(select auth.uid())` y no `auth.uid()` pelado. Envuelto en subselect,
--     Postgres lo evalúa una vez por consulta en vez de una vez por fila.
--   · Las funciones auxiliares son SECURITY DEFINER. Si una política sobre
--     `perfiles` consultara `perfiles`, entraría en recursión infinita; la
--     función salta el RLS y corta el ciclo.
-- ============================================================================

-- ------------------------------------------------------------ auxiliares --
create or replace function public.mi_coach()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coach_id from public.perfiles where id = (select auth.uid());
$$;

create or replace function public.es_coach_de(alumno uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.perfiles
    where id = alumno and coach_id = (select auth.uid())
  );
$$;

grant execute on function public.mi_coach()          to authenticated;
grant execute on function public.es_coach_de(uuid)   to authenticated;

alter table public.perfiles    enable row level security;
alter table public.planes      enable row level security;
alter table public.registros   enable row level security;
alter table public.ejercicios  enable row level security;
alter table public.plan_series enable row level security;

-- Nada de esto se toca sin sesión. Sin este revoke, el rol `anon` conserva
-- los permisos que Supabase otorga por defecto en el esquema public.
revoke all on public.perfiles, public.planes, public.registros, public.ejercicios,
  public.plan_series from anon;

-- ================================================================ perfiles =
-- Cada uno ve el suyo; el coach ve además el de sus alumnos.
drop policy if exists "perfil visible" on public.perfiles;
create policy "perfil visible" on public.perfiles
  for select to authenticated
  using (id = (select auth.uid()) or coach_id = (select auth.uid()));

-- Solo el propio, y sin tocar `rol` ni `coach_id` — de eso se encarga el
-- trigger `perfiles_proteger_campos`, porque RLS filtra filas, no columnas.
drop policy if exists "perfil propio editable" on public.perfiles;
create policy "perfil propio editable" on public.perfiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Sin políticas de insert ni de delete: los perfiles nacen del trigger sobre
-- auth.users y mueren cuando se borra el usuario.

-- ================================================================== planes =
drop policy if exists "planes visibles" on public.planes;
create policy "planes visibles" on public.planes
  for select to authenticated
  using (alumno_id = (select auth.uid()) or coach_id = (select auth.uid()));

-- El coach arma planes, y solo para alumnos suyos. Sin `es_coach_de` podría
-- asignarle un plan al alumno de otro coach.
drop policy if exists "el coach arma planes" on public.planes;
create policy "el coach arma planes" on public.planes
  for insert to authenticated
  with check (coach_id = (select auth.uid()) and public.es_coach_de(alumno_id));

drop policy if exists "el coach edita sus planes" on public.planes;
create policy "el coach edita sus planes" on public.planes
  for update to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()) and public.es_coach_de(alumno_id));

drop policy if exists "el coach borra sus planes" on public.planes;
create policy "el coach borra sus planes" on public.planes
  for delete to authenticated
  using (coach_id = (select auth.uid()));

-- =============================================================== registros =
-- Los escribe el alumno mientras entrena; el coach también puede corregirlos.
--
-- La condición se apoya siempre en el plan y no en `alumno_id` suelto: si
-- mirara solo `alumno_id = auth.uid()`, un alumno podría insertar filas con
-- su propio id dentro del plan de otro y ensuciarle los datos.
drop policy if exists "registros visibles" on public.registros;
create policy "registros visibles" on public.registros
  for select to authenticated
  using (
    exists (
      select 1 from public.planes p
      where p.id = plan_id
        and (p.alumno_id = (select auth.uid()) or p.coach_id = (select auth.uid()))
    )
  );

drop policy if exists "registros escribibles" on public.registros;
create policy "registros escribibles" on public.registros
  for all to authenticated
  using (
    exists (
      select 1 from public.planes p
      where p.id = plan_id
        and (p.alumno_id = (select auth.uid()) or p.coach_id = (select auth.uid()))
    )
  )
  with check (
    exists (
      select 1 from public.planes p
      where p.id = plan_id
        and p.alumno_id = registros.alumno_id
        and (p.alumno_id = (select auth.uid()) or p.coach_id = (select auth.uid()))
    )
  );

-- ============================================================== ejercicios =
-- El alumno ve la biblioteca base y la de su coach. El coach ve la base y la
-- suya. Nadie ve la de un coach ajeno.
drop policy if exists "biblioteca visible" on public.ejercicios;
create policy "biblioteca visible" on public.ejercicios
  for select to authenticated
  using (
    coach_id is null
    or coach_id = (select auth.uid())
    or coach_id = public.mi_coach()
  );

-- La base (`coach_id is null`) no se toca desde la app: es de la casa.
drop policy if exists "biblioteca propia editable" on public.ejercicios;
create policy "biblioteca propia editable" on public.ejercicios
  for all to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

-- ============================================================= plan_series =
-- Mismas reglas que `registros`: la condición se apoya en el plan, nunca en
-- un id suelto. El alumno puede agregarse una serie; el coach también.
drop policy if exists "series visibles" on public.plan_series;
create policy "series visibles" on public.plan_series
  for select to authenticated
  using (
    exists (
      select 1 from public.planes p
      where p.id = plan_id
        and (p.alumno_id = (select auth.uid()) or p.coach_id = (select auth.uid()))
    )
  );

drop policy if exists "series escribibles" on public.plan_series;
create policy "series escribibles" on public.plan_series
  for all to authenticated
  using (
    exists (
      select 1 from public.planes p
      where p.id = plan_id
        and (p.alumno_id = (select auth.uid()) or p.coach_id = (select auth.uid()))
    )
  )
  with check (
    exists (
      select 1 from public.planes p
      where p.id = plan_id
        and (p.alumno_id = (select auth.uid()) or p.coach_id = (select auth.uid()))
    )
  );
