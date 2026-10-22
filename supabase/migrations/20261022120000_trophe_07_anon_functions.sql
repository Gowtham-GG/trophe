-- =============================================================================
-- Trophe 07 — no function is executable by anon
-- Postgres grants EXECUTE on every new function to PUBLIC, and Supabase adds a
-- PROJECT-WIDE default grant to anon. Neither is undone by a per-schema
-- `alter default privileges ... revoke` (migration 01): per-schema defaults
-- can only add. Anon also has no USAGE on the schema, so nothing was
-- reachable; this removes the second door too.
-- Every later migration that creates a function must end with the same two
-- statements (the SQL test-suite checks it).
-- =============================================================================
begin;

revoke execute on all functions in schema trophe from public, anon;
grant execute on all functions in schema trophe to authenticated;
-- trigger functions are never called directly
revoke execute on function trophe.settings_before_write(), trophe.foods_before_write(), trophe.food_servings_before_write(),
                           trophe.touch_updated_at(), trophe.diary_before_write()
  from authenticated;

commit;
