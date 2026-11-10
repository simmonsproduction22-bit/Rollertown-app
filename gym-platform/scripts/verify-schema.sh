#!/usr/bin/env bash
# Applies all migrations to a throwaway Postgres database and runs RLS tests.
# Usage: DATABASE_URL=postgres://... scripts/verify-schema.sh
set -euo pipefail
DB_URL="${DATABASE_URL:?set DATABASE_URL to an empty scratch database}"
cd "$(dirname "$0")/.."
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/test/00_supabase_stubs.sql
for f in supabase/migrations/*.sql; do
  echo "applying $f"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "grant usage on schema public to anon, authenticated; grant select, insert, update, delete on all tables in schema public to anon, authenticated; grant usage, select on all sequences in schema public to anon, authenticated;"
psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/test/rls_test.sql
echo "schema + RLS OK"
