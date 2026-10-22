#!/usr/bin/env bash
# SQL test-suite against a throwaway local Postgres (never your Supabase project):
# shim -> every migration -> supabase/tests/trophe_tests.sql (which rolls itself back).
#   npm run test:sql
set -euo pipefail
cd "$(dirname "$0")/../.."
WORK="$(mktemp -d)"; PGPORT=54339
cleanup() { pg_ctl -D "$WORK/pgdata" stop -m fast >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
initdb -D "$WORK/pgdata" -U postgres -E UTF8 --locale=C.UTF-8 --auth=trust >/dev/null
pg_ctl -D "$WORK/pgdata" -o "-p $PGPORT -k $WORK -c listen_addresses=127.0.0.1 -c fsync=off" -l "$WORK/pg.log" -w start >/dev/null
PSQL="psql -h 127.0.0.1 -p $PGPORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f supabase/tests/supabase_shim.sql
for f in supabase/migrations/*.sql; do $PSQL -f "$f"; done
# re-running every migration must converge (they are all idempotent)
for f in supabase/migrations/*.sql; do $PSQL -f "$f" 2>&1 | grep -v NOTICE || true; done
$PSQL -f supabase/tests/trophe_tests.sql
