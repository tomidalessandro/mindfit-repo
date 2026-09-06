-- ============================================================================
-- MindFit · Perfiles y alta de usuarios
-- ----------------------------------------------------------------------------
-- Primera pieza de la Etapa 3: cada persona pasa a ser un usuario de verdad
-- en auth.users, y `perfiles` le cuelga lo que la app necesita saber de ella.
--
-- No toca `mindfit_store`. La app vieja sigue funcionando sobre esa tabla
-- hasta el cutover.
-- ============================================================================

-- --------------------------------------------------------------- utilidad --
-- Una sola función de "tocar la marca de tiempo", que reusan todas las tablas.
create or replace function public.tocar_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado := now();
  return new;
end;
$$;

-- --------------------------------------------------------------- perfiles --
create table if not exists public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  rol         text not null default 'alumno' check (rol in ('alumno','coach')),
  coach_id    uuid references public.perfiles(id) on delete set null,
  telefono    text,                                  -- para el envío por WhatsApp
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

create index if not exists perfiles_coach_id_idx on public.perfiles (coach_id);

drop trigger if exists perfiles_tocar on public.perfiles;
create trigger perfiles_tocar
  before update on public.perfiles
  for each row execute function public.tocar_actualizado();

-- ------------------------------------------------------- alta automática --
-- Cuando Supabase Auth crea un usuario (invitación del coach o magic link),
-- este trigger le arma el perfil. Corre como SECURITY DEFINER porque escribe
-- en una tabla con RLS desde un contexto que todavía no tiene sesión.
--
-- ⚠️ `rol` se fuerza a 'alumno' a propósito. `raw_user_meta_data` lo controla
-- quien se registra: si lo leyéramos de ahí, cualquiera podría darse de alta
-- como coach. Para promover a alguien está `public.promover_a_coach()`, que
-- solo puede llamar el service_role.
create or replace function public.crear_perfil_de_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre, rol, coach_id, telefono)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'nombre', ''),
      split_part(coalesce(new.email, 'alumno'), '@', 1)
    ),
    'alumno',
    nullif(new.raw_user_meta_data->>'coach_id', '')::uuid,
    nullif(new.raw_user_meta_data->>'telefono', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_de_usuario();

-- ---------------------------------------------------------- promoción -----
-- El único camino para que alguien sea coach. Se llama desde el worker con
-- la service_role key, o a mano desde el SQL Editor.
-- A propósito NO es SECURITY DEFINER: corre con los permisos de quien la
-- llama, así que solo funciona desde un rol que ya puede saltar el RLS de
-- `perfiles` (postgres o service_role). Sumado al revoke de abajo, ese es
-- todo el candado que necesita — y uno que no se puede sortear desde la app.
create or replace function public.promover_a_coach(usuario uuid)
returns void
language sql
set search_path = public
as $$
  update public.perfiles set rol = 'coach', coach_id = null where id = usuario;
$$;

revoke execute on function public.promover_a_coach(uuid) from public, anon, authenticated;

-- ------------------------------------------------- candado sobre el rol ---
-- RLS decide QUÉ FILAS podés tocar, no qué columnas. Sin esto, un alumno con
-- permiso de editar su propio perfil podría ponerse rol='coach' él mismo.
create or replace function public.perfiles_campos_protegidos()
returns trigger
language plpgsql
as $$
begin
  -- Solo se le pone el candado a `authenticated`, que es el rol con el que
  -- PostgREST atiende a la app. `postgres` (SQL Editor, psql) y `service_role`
  -- (el worker) tienen que poder asignarle alumnos a un coach.
  if current_role <> 'authenticated' then
    return new;
  end if;

  if new.rol is distinct from old.rol then
    raise exception 'el rol no se cambia desde la app';
  end if;

  if new.coach_id is distinct from old.coach_id then
    raise exception 'el coach asignado no se cambia desde la app';
  end if;

  return new;
end;
$$;

drop trigger if exists perfiles_proteger_campos on public.perfiles;
create trigger perfiles_proteger_campos
  before update on public.perfiles
  for each row execute function public.perfiles_campos_protegidos();
