#!/usr/bin/env bash
# Corre las pruebas de RLS contra la base local, desde cero.
#
#   npm run test:rls
#
# Necesita Docker andando y `npm run db:start` hecho al menos una vez.
set -euo pipefail
cd "$(dirname "$0")/../.."

proyecto=$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml)
contenedor="supabase_db_${proyecto}"

if ! docker ps --format '{{.Names}}' | grep -qx "$contenedor"; then
  echo "La base local no está levantada. Corré: npm run db:start" >&2
  exit 1
fi

echo "▸ aplicando migraciones desde cero…"
npx supabase db reset --no-seed >/dev/null

echo "▸ probando las políticas RLS…"
salida=$(docker exec -i "$contenedor" psql -U postgres -d postgres -q < supabase/tests/rls.sql 2>&1)

echo "$salida" | grep -E '^(NOTICE|──|✅|ERROR)' | sed 's/^NOTICE:  //'

if echo "$salida" | grep -q '^ERROR'; then
  exit 1
fi
