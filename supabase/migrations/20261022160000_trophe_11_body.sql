-- =============================================================================
-- Trophe 11 — body: weight trend, measurements, water
-- Daily weight jumps around by a kilo with water and salt, so progress is read
-- from a smoothed trend (an exponentially weighted moving average, as in The
-- Hacker's Diet: each weigh-in moves the trend 10 % of the way per day since
-- the last one). It's worked out here so every client shows the same numbers.
-- =============================================================================
begin;

-- --------------------------------------------------------- measurements --
-- one row per day; any of the values may be left out
create table if not exists trophe.measurements (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day          date not null,
  body_fat_pct numeric(4,1) check (body_fat_pct between 2 and 70),
  waist_cm     numeric(5,1) check (waist_cm between 20 and 300),
  hips_cm      numeric(5,1) check (hips_cm between 20 and 300),
  chest_cm     numeric(5,1) check (chest_cm between 20 and 300),
  neck_cm      numeric(5,1) check (neck_cm between 10 and 100),
  arm_cm       numeric(5,1) check (arm_cm between 10 and 100),
  thigh_cm     numeric(5,1) check (thigh_cm between 10 and 150),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, day)
);
drop trigger if exists measurements_touch on trophe.measurements;
create trigger measurements_touch before insert or update on trophe.measurements
  for each row execute function trophe.touch_updated_at();

-- ---------------------------------------------------------------- water --
-- each glass is a row (so the last one can be undone); the day is the user's local day
create table if not exists trophe.water_entries (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day       date not null,
  ml        integer not null check (ml between 1 and 5000),
  logged_at timestamptz not null default now()
);
create index if not exists water_entries_user_day_idx on trophe.water_entries (user_id, day);

alter table trophe.settings
  add column if not exists water_goal_ml integer not null default 2500 check (water_goal_ml between 250 and 10000);

do $$
declare t text;
begin
  foreach t in array array['measurements', 'water_entries'] loop
    execute format('alter table trophe.%I enable row level security', t);
    execute format('drop policy if exists %I on trophe.%I', t || '_owner', t);
    execute format(
      'create policy %I on trophe.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_owner', t);
  end loop;
end $$;
grant select, insert, update, delete on trophe.measurements, trophe.water_entries to authenticated;

-- ---------------------------------------------------------- weight trend --
-- every weigh-in in [p_from, p_to] with the trend on that day. The trend starts at the first weigh-in ever and
-- runs through all earlier ones, so it is already settled at p_from.
create or replace function trophe.weight_trend(p_from date, p_to date)
returns table (day date, kg numeric, trend numeric)
language plpgsql
stable
set search_path = ''
as $$
declare
  r record;
  t numeric;
  prev date;
begin
  for r in select w.day, w.kg from trophe.weigh_ins w where w.user_id = (select auth.uid()) and w.day <= p_to order by w.day loop
    t := case when t is null then r.kg else t + (1 - power(0.9, r.day - prev)) * (r.kg - t) end;
    prev := r.day;
    if r.day >= p_from then
      day := r.day; kg := r.kg; trend := round(t, 2);
      return next;
    end if;
  end loop;
end
$$;

-- the latest weigh-in and trend, and how fast the trend is moving (kg per week, over the last ~2 weeks;
-- null until there are 7 days between weigh-ins to compare)
create or replace function trophe.weight_summary()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with last as (select max(w.day) as d from trophe.weigh_ins w where w.user_id = (select auth.uid())),
  t as (select wt.* from last, trophe.weight_trend(last.d - 28, last.d) wt),
  latest as (select * from t order by day desc limit 1),
  -- the weigh-in closest to 14 days before the latest, at least 7 days before it
  ref as (select t.* from t, latest where t.day <= latest.day - 7 order by abs((latest.day - t.day) - 14), t.day desc limit 1)
  select jsonb_build_object(
    'latest', (select jsonb_build_object('day', day, 'kg', kg, 'trend', trend) from latest),
    'first', (select jsonb_build_object('day', w.day, 'kg', w.kg) from trophe.weigh_ins w where w.user_id = (select auth.uid()) order by w.day limit 1),
    'count', (select count(*) from trophe.weigh_ins w where w.user_id = (select auth.uid())),
    'week_rate', (select round((latest.trend - ref.trend) / ((latest.day - ref.day) / 7.0), 2) from latest, ref)
  )
$$;

-- ml per day in [p_from, p_to] (days without water included, as 0)
create or replace function trophe.water_range(p_from date, p_to date)
returns table (day date, ml integer)
language sql
stable
set search_path = ''
as $$
  select d::date, coalesce((select sum(w.ml) from trophe.water_entries w where w.user_id = (select auth.uid()) and w.day = d::date), 0)::integer
  from generate_series(p_from, least(p_to, p_from + 400), interval '1 day') d
  order by 1
$$;

-- see migration 07: no function is executable by anon / PUBLIC
revoke execute on all functions in schema trophe from public, anon;
grant execute on all functions in schema trophe to authenticated;
revoke execute on function trophe.settings_before_write(), trophe.foods_before_write(), trophe.food_servings_before_write(),
                           trophe.touch_updated_at(), trophe.diary_before_write(), trophe.recipe_items_before_write(),
                           trophe.foods_after_update()
  from authenticated;

commit;
