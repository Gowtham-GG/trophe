-- =============================================================================
-- Trophe 01 — schema and grants
-- Additive only: creates the `trophe` schema. Touches nothing in `public`
-- (Argus) or `mneme` (Mneme). Safe to re-run.
-- Manual step after applying: Dashboard -> Settings -> API -> add `trophe`
-- to "Exposed schemas" so PostgREST / supabase-js can reach it.
-- =============================================================================
begin;

create schema if not exists trophe;

-- Nobody but signed-in users may even see the schema.
revoke all on schema trophe from public;
revoke all on schema trophe from anon;
grant usage on schema trophe to authenticated;

-- Objects created later by the migration role inherit these grants.
alter default privileges in schema trophe
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema trophe
  grant execute on functions to authenticated;
-- Functions are executable by PUBLIC by default; keep anon out of them too.
alter default privileges in schema trophe
  revoke execute on functions from public;

commit;
