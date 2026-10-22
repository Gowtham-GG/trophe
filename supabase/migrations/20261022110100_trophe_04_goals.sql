-- =============================================================================
-- Trophe 04 — goals and weigh-ins
-- A goal applies from `effective_from` until the next one, so changing your
-- targets never rewrites how past days are judged.
-- Weigh-ins start here (the goal wizard records your current weight); the
-- trend and charts arrive in Phase 3.
-- =============================================================================
begin;

create table if not exists trophe.goals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  effective_from date not null,
  kcal           integer not null check (kcal between 500 and 10000),
  protein_g      integer not null check (protein_g between 0 and 1000),
  carbs_g        integer not null check (carbs_g between 0 and 1500),
  fat_g          integer not null check (fat_g between 0 and 1000),
  fiber_g        integer check (fiber_g between 0 and 200),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- one goal per start day: saving again the same day replaces it (upsert)
  constraint goals_user_day_key unique (user_id, effective_from)
);

create table if not exists trophe.weigh_ins (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day        date not null,
  kg         numeric(5,2) not null check (kg between 20 and 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create or replace function trophe.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end
$$;
drop trigger if exists goals_touch on trophe.goals;
create trigger goals_touch before insert or update on trophe.goals
  for each row execute function trophe.touch_updated_at();
drop trigger if exists weigh_ins_touch on trophe.weigh_ins;
create trigger weigh_ins_touch before insert or update on trophe.weigh_ins
  for each row execute function trophe.touch_updated_at();

-- The goal in force on a day (null before the first goal).
create or replace function trophe.goal_for(p_day date)
returns setof trophe.goals
language sql
stable
set search_path = ''
as $$
  select g.* from trophe.goals g
  where g.user_id = (select auth.uid()) and g.effective_from <= p_day
  order by g.effective_from desc
  limit 1
$$;

-- ================================================================== RLS ==
do $$
declare t text;
begin
  foreach t in array array['goals', 'weigh_ins'] loop
    execute format('alter table trophe.%I enable row level security', t);
    execute format('drop policy if exists %I on trophe.%I', t || '_owner', t);
    execute format(
      'create policy %I on trophe.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_owner', t);
  end loop;
end $$;

grant select, insert, update, delete on all tables in schema trophe to authenticated;
grant execute on function trophe.goal_for(date) to authenticated;
revoke execute on function trophe.touch_updated_at() from public, anon, authenticated;

commit;
