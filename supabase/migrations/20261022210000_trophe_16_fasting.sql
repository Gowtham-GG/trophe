-- =============================================================================
-- Trophe 16 — fasting timer
-- One row per fast: when it started, when it ended (null while running) and the
-- length aimed for. At most one runs at a time. fasting_stats() sums up the
-- last 30 days of finished fasts.
-- =============================================================================
begin;

create table if not exists trophe.fasts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  started_at   timestamptz not null,
  ended_at     timestamptz,
  target_hours numeric(4,1) not null check (target_hours between 1 and 72),
  created_at   timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at),
  check (ended_at is null or ended_at - started_at <= interval '7 days'),
  check (started_at <= now() + interval '5 minutes')
);
-- at most one running fast per user
create unique index if not exists fasts_one_running on trophe.fasts (user_id) where ended_at is null;
create index if not exists fasts_user_started_idx on trophe.fasts (user_id, started_at desc);

alter table trophe.fasts enable row level security;
drop policy if exists fasts_owner on trophe.fasts;
create policy fasts_owner on trophe.fasts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on trophe.fasts to authenticated;

-- finished fasts that started in the last 30 days: how many, how many reached their target, average and longest
create or replace function trophe.fasting_stats()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with f as (
    select extract(epoch from (ended_at - started_at)) / 3600 as hours, target_hours
    from trophe.fasts
    where user_id = (select auth.uid()) and ended_at is not null and started_at >= now() - interval '30 days'
  )
  select jsonb_build_object(
    'count', (select count(*) from f),
    'reached', (select count(*) from f where hours >= target_hours),
    'avg_hours', (select round(avg(hours), 1) from f),
    'longest_hours', (select round(max(hours), 1) from f)
  )
$$;

-- see migration 07: no function is executable by anon / PUBLIC
revoke execute on all functions in schema trophe from public, anon;
grant execute on all functions in schema trophe to authenticated;
revoke execute on function trophe.settings_before_write(), trophe.foods_before_write(), trophe.food_servings_before_write(),
                           trophe.touch_updated_at(), trophe.diary_before_write(), trophe.recipe_items_before_write(),
                           trophe.foods_after_update()
  from authenticated;

commit;
