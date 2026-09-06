-- ============================================================================
-- MindFit · Pruebas de las políticas RLS
-- ----------------------------------------------------------------------------
-- RLS que no se prueba es RLS que suponés que anda. Esto simula sesiones de
-- verdad —`set local role authenticated` + el JWT de cada quien, que es
-- exactamente lo que hace PostgREST— y verifica quién ve qué.
--
--   npm run test:rls
--
-- Todo corre dentro de una transacción que termina en rollback: no deja nada.
-- ============================================================================

\set ON_ERROR_STOP on
begin;

-- ------------------------------------------------------------- utilidades --
create or replace function pg_temp.afirmar(condicion boolean, que text)
returns void language plpgsql as $$
begin
  if condicion is not true then
    raise exception 'FALLÓ: %', que;
  end if;
  raise notice '  ok · %', que;
end $$;

-- Espera que el bloque falle. Se usa para las prohibiciones: que una escritura
-- indebida NO pase es la mitad de lo que estamos probando.
create or replace function pg_temp.afirmar_prohibido(sentencia text, que text)
returns void language plpgsql as $$
begin
  execute sentencia;
  raise exception 'FALLÓ: % (la operación fue permitida y no debía)', que;
exception
  when insufficient_privilege or raise_exception or check_violation then
    raise notice '  ok · %', que;
end $$;

-- ------------------------------------------------------------- escenario ---
-- Dos coaches que no se conocen, dos alumnos de uno y un alumno del otro.
-- Es el caso mínimo donde se puede filtrar información de verdad.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachA@test.local','{"nombre":"Coach A"}',now(),now()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','coachB@test.local','{"nombre":"Coach B"}',now(),now()),
  ('aaaaaaaa-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ana@test.local','{"nombre":"Ana"}',now(),now()),
  ('aaaaaaaa-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','beto@test.local','{"nombre":"Beto"}',now(),now()),
  ('bbbbbbbb-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','caro@test.local','{"nombre":"Caro"}',now(),now());

\echo '── alta automática de perfiles ──'
select pg_temp.afirmar((select count(*) from public.perfiles) = 5,
  'el trigger sobre auth.users creó los 5 perfiles');
select pg_temp.afirmar((select nombre from public.perfiles where id='aaaaaaaa-0000-0000-0000-000000000001') = 'Ana',
  'toma el nombre de raw_user_meta_data');
select pg_temp.afirmar((select bool_and(rol = 'alumno') from public.perfiles),
  'todos nacen como alumno, nadie se autoproclama coach');

select public.promover_a_coach('11111111-1111-1111-1111-111111111111');
select public.promover_a_coach('22222222-2222-2222-2222-222222222222');
update public.perfiles set coach_id='11111111-1111-1111-1111-111111111111'
  where id in ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002');
update public.perfiles set coach_id='22222222-2222-2222-2222-222222222222'
  where id='bbbbbbbb-0000-0000-0000-000000000001';

insert into public.planes (id, alumno_id, coach_id, titulo, semanas)
values
  ('99999999-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Mesociclo de Ana', 4),
  ('99999999-0000-0000-0000-00000000000b','bbbbbbbb-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','Mesociclo de Caro',4);

insert into public.registros (plan_id, alumno_id, dia, bloque, ejercicio, semana, serie, carga, reps)
values ('99999999-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001',0,1,3,2,1,'40','8');

insert into public.ejercicios (coach_id, nombre, carga)
values ('22222222-2222-2222-2222-222222222222','Invento privado del Coach B','kg');


-- ══════════════════════════════════════════════════════ sin sesión (anon) ══
\echo ''
\echo '── anónimo: la clave pública sola no abre nada ──'
set local role anon;
select pg_temp.afirmar_prohibido('select count(*) from public.perfiles',  'anon no lee perfiles');
select pg_temp.afirmar_prohibido('select count(*) from public.planes',    'anon no lee planes');
select pg_temp.afirmar_prohibido('select count(*) from public.registros', 'anon no lee registros');
reset role;


-- ══════════════════════════════════════════════════════════ alumna (Ana) ══
\echo ''
\echo '── Ana, alumna del Coach A ──'
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';

select pg_temp.afirmar((select count(*) from public.planes) = 1,
  'Ana ve su plan y solo el suyo');
select pg_temp.afirmar((select count(*) from public.planes where alumno_id='bbbbbbbb-0000-0000-0000-000000000001') = 0,
  'Ana no ve el plan de la alumna del otro coach');
select pg_temp.afirmar((select count(*) from public.registros) = 1,
  'Ana ve sus registros');
select pg_temp.afirmar((select count(*) from public.perfiles) = 1,
  'Ana ve solo su perfil, ni el de Beto ni el del coach');

-- El corazón del asunto: hoy el PIN `mindfit` está en el código fuente.
select pg_temp.afirmar_prohibido(
  $$update public.perfiles set rol='coach' where id='aaaaaaaa-0000-0000-0000-000000000001'$$,
  'Ana no puede ascenderse a coach');
select pg_temp.afirmar_prohibido(
  $$update public.perfiles set coach_id='22222222-2222-2222-2222-222222222222' where id='aaaaaaaa-0000-0000-0000-000000000001'$$,
  'Ana no puede cambiarse de coach sola');
select pg_temp.afirmar_prohibido(
  $$insert into public.planes (alumno_id, coach_id, titulo) values ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Me armo yo')$$,
  'Ana no puede armarse un plan');

-- El agujero que tenía el esquema original: mirar solo `alumno_id = auth.uid()`
-- dejaba escribir con el propio id dentro del plan de otro.
select pg_temp.afirmar_prohibido(
  $$insert into public.registros (plan_id, alumno_id, dia, bloque, ejercicio, semana, serie, carga)
    values ('99999999-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000001',0,0,0,0,0,'999')$$,
  'Ana no puede meter registros en el plan de Caro');

-- Lo que sí tiene que poder: cargar el peso de su serie.
insert into public.registros (plan_id, alumno_id, dia, bloque, ejercicio, semana, serie, carga, reps)
values ('99999999-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001',0,1,3,2,2,'42','8')
on conflict (plan_id, dia, bloque, ejercicio, semana, serie)
do update set carga = excluded.carga, reps = excluded.reps;
select pg_temp.afirmar((select count(*) from public.registros) = 2,
  'Ana sí puede cargar el peso de su serie (con upsert)');

select pg_temp.afirmar((select count(*) from public.ejercicios where nombre='Invento privado del Coach B') = 0,
  'Ana no ve la biblioteca privada del otro coach');
select pg_temp.afirmar((select count(*) from public.ejercicios where coach_id is null) = 75,
  'Ana sí ve la biblioteca base');
reset role;


-- ═══════════════════════════════════════════════════════════════ Coach A ══
\echo ''
\echo '── Coach A ──'
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select pg_temp.afirmar((select count(*) from public.perfiles) = 3,
  'el Coach A se ve a sí mismo y a sus dos alumnos');
select pg_temp.afirmar((select count(*) from public.planes) = 1,
  'el Coach A ve los planes que armó él');
select pg_temp.afirmar((select count(*) from public.registros) = 2,
  'el Coach A ve lo que carga su alumna mientras entrena');

insert into public.planes (alumno_id, coach_id, titulo)
values ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','Mesociclo de Beto');
select pg_temp.afirmar((select count(*) from public.planes) = 2,
  'el Coach A puede armarle un plan a un alumno suyo');

select pg_temp.afirmar_prohibido(
  $$insert into public.planes (alumno_id, coach_id, titulo) values ('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Me meto')$$,
  'el Coach A no puede armarle un plan a la alumna del Coach B');
select pg_temp.afirmar_prohibido(
  $$update public.planes set titulo='Pisado' where id='99999999-0000-0000-0000-00000000000b'$$,
  'el Coach A no puede editar el plan del Coach B');

update public.registros set carga='45' where plan_id='99999999-0000-0000-0000-00000000000a' and serie=1;
select pg_temp.afirmar((select carga from public.registros where plan_id='99999999-0000-0000-0000-00000000000a' and serie=1) = '45',
  'el Coach A sí puede corregirle un peso a su alumna');
reset role;


-- ═══════════════════════════════════════════════════════════════ Coach B ══
\echo ''
\echo '── Coach B: el aislamiento entre coaches ──'
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select pg_temp.afirmar((select count(*) from public.planes) = 1,
  'el Coach B no ve ni uno de los planes del Coach A');
select pg_temp.afirmar((select count(*) from public.registros) = 0,
  'el Coach B no ve los pesos de los alumnos del Coach A');
select pg_temp.afirmar((select count(*) from public.perfiles) = 2,
  'el Coach B no ve a los alumnos del Coach A');
reset role;

\echo ''
\echo '✅ todas las pruebas de RLS pasaron'
rollback;
