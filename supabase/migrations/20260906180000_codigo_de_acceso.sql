-- ============================================================================
-- MindFit · Códigos de acceso directo
-- ----------------------------------------------------------------------------
-- Un link por persona que entra sin mail y sin contraseña, para que los
-- alumnos puedan probar la app mientras el envío de mails no esté resuelto.
--
-- Es el mismo gesto que el `#karina` de la v2 —un link que se manda por
-- WhatsApp y abre la rutina— pero con una diferencia de fondo: el `#karina`
-- era ruteo disfrazado de seguridad, y bastaba escribir otro nombre en la
-- barra para entrar como otro. Acá el código es aleatorio de 20 caracteres
-- (~100 bits), y lo único que hace es abrir una sesión de verdad de Supabase
-- Auth. De ahí en adelante manda RLS igual que siempre: cada alumno sigue
-- viendo solo lo suyo, y el coach solo a sus alumnos.
--
-- Sigue siendo un token al portador dentro de una URL: quien tenga el link,
-- entra. Para el período de prueba con alumnos conocidos es un riesgo
-- aceptable y consciente; para abrirla al público, no. Se apaga poniendo el
-- código en null, y se rota generando otro.
-- ============================================================================

alter table public.perfiles
  add column if not exists codigo_acceso text unique
    check (codigo_acceso is null or length(codigo_acceso) >= 16);

comment on column public.perfiles.codigo_acceso is
  'Token del link de acceso directo. Provisorio, para la prueba con alumnos. '
  'Se revoca poniéndolo en null.';

-- El canje del código lo hace el servidor con la service key, que saltea RLS.
-- Nadie más tiene por qué poder leer esta columna: sin este revoke, la
-- política "perfil visible" le dejaría al coach leer los códigos de sus
-- alumnos, y a cada alumno el suyo. Un token que no hace falta mostrar, no se
-- muestra.
revoke select (codigo_acceso) on public.perfiles from anon, authenticated;
