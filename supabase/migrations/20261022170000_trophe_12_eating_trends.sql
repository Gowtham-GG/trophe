-- =============================================================================
-- Trophe 12 — eating over time
-- Averages per week or month, weekdays against weekends, and streaks, all built
-- on range_summary() so "on target" means the same everywhere (within 10 % of
-- the goal in force that day). Averages count only days with something logged:
-- an empty day is a day not tracked, not a day of fasting.
-- =============================================================================
begin;

-- one row per ISO week (Monday) or calendar month in [p_from, p_to]
create or replace function trophe.nutrition_periods(p_from date, p_to date, p_period text default 'week')
returns table (period_start date, days integer, logged_days integer, kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
               goal_kcal numeric, on_target integer)
language sql
stable
set search_path = ''
as $$
  select date_trunc(case when p_period = 'month' then 'month' else 'week' end, d.day)::date,
         count(*)::integer,
         count(*) filter (where d.entries > 0)::integer,
         round(avg(d.kcal) filter (where d.entries > 0)),
         round(avg(d.protein_g) filter (where d.entries > 0), 1),
         round(avg(d.carbs_g) filter (where d.entries > 0), 1),
         round(avg(d.fat_g) filter (where d.entries > 0), 1),
         round(avg(d.goal_kcal) filter (where d.entries > 0)),
         count(*) filter (where d.status = 'on')::integer
  from trophe.range_summary(p_from, p_to) d
  group by 1
  order by 1
$$;

-- the whole range at once: averages, weekdays vs weekends (Sat + Sun), and how the days went against the goal
create or replace function trophe.nutrition_stats(p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with d as (select * from trophe.range_summary(p_from, p_to)),
  logged as (select * from d where entries > 0)
  select jsonb_build_object(
    'days', (select count(*) from d),
    'logged_days', (select count(*) from logged),
    'avg', (select jsonb_build_object('kcal', round(avg(kcal)), 'protein_g', round(avg(protein_g), 1), 'carbs_g', round(avg(carbs_g), 1), 'fat_g', round(avg(fat_g), 1)) from logged),
    'avg_goal_kcal', (select round(avg(goal_kcal)) from logged),
    'weekday', (select jsonb_build_object('kcal', round(avg(kcal)), 'days', count(*)) from logged where extract(isodow from day) < 6),
    'weekend', (select jsonb_build_object('kcal', round(avg(kcal)), 'days', count(*)) from logged where extract(isodow from day) >= 6),
    'status', (select jsonb_build_object(
                 'on', count(*) filter (where status = 'on'), 'under', count(*) filter (where status = 'under'),
                 'over', count(*) filter (where status = 'over'), 'logged', count(*) filter (where status = 'logged')) from d)
  )
$$;

-- streaks over the last 400 days: days in a row with something logged, and days in a row on target.
-- "current" is the run that ends today or yesterday (today may not be finished yet).
create or replace function trophe.streaks(p_today date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with d as (select * from trophe.range_summary(p_today - 399, p_today)),
  log_runs as (
    select max(day) as e, count(*) as n
    from (select day, day - (row_number() over (order by day))::integer as g from d where entries > 0) x group by g
  ),
  target_runs as (
    select max(day) as e, count(*) as n
    from (select day, day - (row_number() over (order by day))::integer as g from d where status = 'on') x group by g
  )
  select jsonb_build_object(
    'logging_current', coalesce((select n from log_runs where e >= p_today - 1 order by e desc limit 1), 0),
    'logging_best', coalesce((select max(n) from log_runs), 0),
    'target_current', coalesce((select n from target_runs where e >= p_today - 1 order by e desc limit 1), 0),
    'target_best', coalesce((select max(n) from target_runs), 0)
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
