-- ============================================================================
-- MindFit · Dar de baja a un alumno sin perder su historia
-- ----------------------------------------------------------------------------
-- Cuando un alumno deja de entrenar, el coach necesita sacarlo de la lista
-- sin borrarlo: sus mesociclos y los pesos que cargó son el registro de su
-- entrenamiento, y además el coach quiere poder mirarlos si vuelve.
--
-- Por qué una marca y no una tabla aparte, que era la idea original:
--
--   `planes.alumno_id` y `registros.alumno_id` apuntan a `perfiles`. Mover la
--   fila a otra tabla obligaría a mover también los planes y los registros —o
--   a soltar las claves foráneas y quedarse con referencias colgando—, que es
--   exactamente perder lo que se quería guardar. La fila se queda donde está,
--   con una fecha de baja, y las relaciones siguen intactas.
--
-- La "tabla de deprecados" existe igual, como la vista de abajo: se consulta
-- igual que una tabla y no cuesta nada mantener.
-- ============================================================================

alter table public.perfiles
  add column if not exists archivado_en timestamptz;

comment on column public.perfiles.archivado_en is
  'Cuándo se dio de baja. Null = activo. La fila nunca se borra: sus planes y '
  'registros dependen de ella.';

-- Solo se indexan los archivados, que son pocos: un índice parcial ocupa
-- nada y sirve igual para la vista.
create index if not exists perfiles_archivados_idx
  on public.perfiles (coach_id, archivado_en)
  where archivado_en is not null;

-- ------------------------------------------------------------------ vista --
-- La lista de bajas, para consultarla como una tabla más.
--
-- `security_invoker` es lo que hace que RLS siga aplicando: sin eso la vista
-- correría con los permisos de quien la creó y le mostraría a cualquiera los
-- alumnos archivados de todos los coaches.
create or replace view public.alumnos_archivados
with (security_invoker = true) as
  select id, nombre, rol, coach_id, telefono, creado, archivado_en,
         (select count(*) from public.planes p where p.alumno_id = perfiles.id) as planes,
         (select count(*) from public.registros r where r.alumno_id = perfiles.id) as registros
  from public.perfiles
  where archivado_en is not null;

comment on view public.alumnos_archivados is
  'Los alumnos dados de baja, con cuánto dejaron cargado. Respeta RLS: cada '
  'coach ve solo los suyos.';

revoke all on public.alumnos_archivados from anon;
grant select on public.alumnos_archivados to authenticated;

-- ------------------------------------------------- candado sobre la baja --
-- Igual que `rol` y `coach_id`: RLS decide qué filas se tocan, no qué
-- columnas. Sin esto, un alumno con permiso de editar su propio perfil podría
-- darse de baja solo, o revivirse después de que el coach lo archivó.
create or replace function public.perfiles_campos_protegidos()
returns trigger
language plpgsql
as $$
begin
  -- Solo se le pone el candado a `authenticated`, que es el rol con el que
  -- PostgREST atiende a la app. `postgres` (SQL Editor, psql) y `service_role`
  -- (el worker y las rutas de servidor) tienen que poder cambiarlos.
  if current_role <> 'authenticated' then
    return new;
  end if;

  if new.rol is distinct from old.rol then
    raise exception 'el rol no se cambia desde la app';
  end if;

  if new.coach_id is distinct from old.coach_id then
    raise exception 'el coach asignado no se cambia desde la app';
  end if;

  if new.archivado_en is distinct from old.archivado_en then
    raise exception 'el alta y la baja no se cambian desde la app';
  end if;

  return new;
end;
$$;
