-- =============================================================================
-- Trophe 02 — per-user settings, Row Level Security
-- One row per user, created lazily by the app's first upsert (no trigger on
-- auth.users: Argus owns `handle_new_user`). The theme list lives in the app
-- (src/lib/themes.ts); the database only checks the id's shape, so adding a
-- theme never needs a migration.
-- =============================================================================
begin;

create table if not exists trophe.settings (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  timezone    text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  theme       text not null default 'jade' check (theme ~ '^[a-z][a-z0-9-]{1,23}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function trophe.settings_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- reject unknown timezone names up front (would otherwise break "today" for every query)
  perform now() at time zone new.timezone;
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end
$$;
drop trigger if exists settings_before_write on trophe.settings;
create trigger settings_before_write
  before insert or update on trophe.settings
  for each row execute function trophe.settings_before_write();

-- ================================================================== RLS ==
-- One policy per table: a row is visible/writable only to its owner.
-- (select auth.uid()) is evaluated once per statement, not once per row.
do $$
declare t text;
begin
  foreach t in array array['settings'] loop
    execute format('alter table trophe.%I enable row level security', t);
    execute format('drop policy if exists %I on trophe.%I', t || '_owner', t);
    execute format(
      'create policy %I on trophe.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_owner', t);
  end loop;
end $$;

-- Default privileges only cover tables created *after* they were set; make the
-- grants explicit so re-running against an existing schema converges.
grant select, insert, update, delete on all tables in schema trophe to authenticated;
-- trigger functions are never called directly
revoke execute on function trophe.settings_before_write() from public, anon, authenticated;

commit;
