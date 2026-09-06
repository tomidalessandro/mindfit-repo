-- ============================================================================
-- MindFit · Esquema ACTUAL (Etapa 0)
-- ----------------------------------------------------------------------------
-- Correr una sola vez, en el SQL Editor de Supabase, con el proyecto recién
-- creado.
--
-- Qué hace: una sola tabla de clave/valor. La app guarda documentos JSON
-- enteros bajo claves con nombre:
--
--   alumnos          → [{id, nombre, creado}, ...]
--   indice           → [{id, alumnoId, titulo, semanas, dias, estado}, ...]
--   biblioteca       → [{n: nombre, v: link de video}, ...]
--   plan:<id>        → el mesociclo completo (días, bloques, ejercicios)
--   cargas:<id>      → los pesos y reps cargados de ese mesociclo
--
-- ⚠️ ADVERTENCIA DE SEGURIDAD — LEER ANTES DE ABRIRLA A DESCONOCIDOS
--
-- La política de abajo deja leer y escribir TODA la tabla a cualquiera que
-- tenga la clave pública, y esa clave viaja dentro del index.html. O sea:
-- cualquiera que abra la app puede, con la consola del navegador, leer y
-- borrar los datos de todos los alumnos.
--
-- Para tu grupo de alumnos conocidos es un riesgo aceptable y consciente.
-- Para abrirla al público NO alcanza. El camino para arreglarlo está en
-- HANDOFF.md (Etapa 2 y Etapa 3) y el esquema que viene después está
-- esbozado en 02_esquema_relacional.sql.
-- ============================================================================

create table if not exists mindfit_store (
  clave       text primary key,
  valor       jsonb,
  actualizado timestamptz default now()
);

-- Cada vez que se pisa una fila, se actualiza la marca de tiempo sola.
-- Sirve para saber cuándo se tocó cada cosa y para depurar.
create or replace function mindfit_tocar()
returns trigger
language plpgsql
as $$
begin
  new.actualizado = now();
  return new;
end;
$$;

drop trigger if exists mindfit_store_tocar on mindfit_store;
create trigger mindfit_store_tocar
  before update on mindfit_store
  for each row execute function mindfit_tocar();

alter table mindfit_store enable row level security;

-- Política abierta: ver la advertencia de arriba.
drop policy if exists "app mindfit" on mindfit_store;
create policy "app mindfit" on mindfit_store
  for all
  to anon
  using (true)
  with check (true);


-- ============================================================================
-- CONSULTAS ÚTILES PARA EL DÍA A DÍA
-- (pegar en el SQL Editor cuando haga falta; no hace falta correrlas ahora)
-- ============================================================================

-- Ver qué hay guardado y cuándo se tocó por última vez:
--   select clave, actualizado, pg_column_size(valor) as bytes
--   from mindfit_store order by actualizado desc;

-- Ver los alumnos cargados:
--   select jsonb_pretty(valor) from mindfit_store where clave = 'alumnos';

-- Copia de seguridad completa en un solo texto (guardalo en un archivo):
--   select jsonb_pretty(jsonb_object_agg(clave, valor)) from mindfit_store;

-- Cuánto ocupa todo (el plan gratis de Supabase da de sobra para esto):
--   select pg_size_pretty(sum(pg_column_size(valor))::bigint) from mindfit_store;

-- Borrar los planes huérfanos que quedan cuando se elimina un mesociclo
-- (la app vacía el contenido pero deja la fila; esto la saca del todo):
--   delete from mindfit_store where valor is null;
