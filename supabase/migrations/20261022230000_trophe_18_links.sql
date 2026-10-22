-- =============================================================================
-- Trophe 18 — links to Mneme and Argus
-- Which Mneme habits Trophe ticks (protein goal met, water goal met, food
-- logged) and which Argus expense categories count as food spending. Only the
-- choices live here; the reading and ticking happen in the app through the
-- shared Supabase project and each app's own RLS. Trophe creates nothing in
-- `mneme` or `public` (see README "Coexistence").
-- =============================================================================
begin;

alter table trophe.settings add column if not exists links jsonb not null default '{}'::jsonb;
alter table trophe.settings drop constraint if exists settings_links_shape;
alter table trophe.settings add constraint settings_links_shape check (
  jsonb_typeof(links) = 'object' and pg_column_size(links) < 8192
  and (links->'mneme' is null or jsonb_typeof(links->'mneme') = 'object')
  and (links->'argus' is null or jsonb_typeof(links->'argus') = 'object')
);

commit;
