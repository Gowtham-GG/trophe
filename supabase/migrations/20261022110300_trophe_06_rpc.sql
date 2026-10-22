-- =============================================================================
-- Trophe 06 — read model + diary actions (all SECURITY INVOKER: RLS applies)
-- Every client gets the same totals, goal and "on target" verdict from here.
-- =============================================================================
begin;

-- ------------------------------------------------------------- day_summary --
-- { day, goal: {...} | null, totals: {kcal, protein_g, carbs_g, fat_g, fiber_g, entries},
--   meals: { <meal>: {kcal, protein_g, carbs_g, fat_g, entries} } }
create or replace function trophe.day_summary(p_day date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with e as (
    select * from trophe.diary_entries where user_id = (select auth.uid()) and day = p_day
  )
  select jsonb_build_object(
    'day', p_day,
    'goal', (select jsonb_build_object('kcal', g.kcal, 'protein_g', g.protein_g, 'carbs_g', g.carbs_g,
                                       'fat_g', g.fat_g, 'fiber_g', g.fiber_g, 'effective_from', g.effective_from)
             from trophe.goal_for(p_day) g),
    'totals', (select jsonb_build_object('kcal', coalesce(sum(kcal), 0), 'protein_g', coalesce(sum(protein_g), 0),
                                         'carbs_g', coalesce(sum(carbs_g), 0), 'fat_g', coalesce(sum(fat_g), 0),
                                         'fiber_g', sum(fiber_g), 'entries', count(*))
               from e),
    'meals', coalesce((select jsonb_object_agg(meal, jsonb_build_object('kcal', k, 'protein_g', p, 'carbs_g', c, 'fat_g', f, 'entries', n))
                       from (select meal, sum(kcal) k, sum(protein_g) p, sum(carbs_g) c, sum(fat_g) f, count(*) n from e group by meal) m),
                      '{}'::jsonb)
  )
$$;

-- ----------------------------------------------------------- range_summary --
-- One row per day in [p_from, p_to] (max ~13 months), with the verdict:
--   empty  nothing logged     logged  logged, but no goal yet
--   under  < 90 % of goal     on      90–110 %       over  > 110 %
create or replace function trophe.range_summary(p_from date, p_to date)
returns table (day date, kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
               entries integer, goal_kcal integer, status text)
language sql
stable
set search_path = ''
as $$
  select d::date, coalesce(t.kcal, 0), coalesce(t.p, 0), coalesce(t.c, 0), coalesce(t.f, 0),
         coalesce(t.n, 0)::integer, g.kcal,
         case when coalesce(t.n, 0) = 0 then 'empty'
              when g.kcal is null then 'logged'
              when t.kcal < g.kcal * 0.9 then 'under'
              when t.kcal > g.kcal * 1.1 then 'over'
              else 'on' end
  from generate_series(p_from, least(p_to, p_from + 400), interval '1 day') d
  left join lateral (
    select sum(e.kcal) kcal, sum(e.protein_g) p, sum(e.carbs_g) c, sum(e.fat_g) f, count(*) n
    from trophe.diary_entries e where e.user_id = (select auth.uid()) and e.day = d::date
  ) t on true
  left join lateral (select gf.kcal from trophe.goal_for(d::date) gf) g on true
  order by 1
$$;

-- ------------------------------------------------- recent / frequent foods --
-- Foods (not archived) with how much was had last time, so one tap re-logs it.
-- p_meal narrows to what you eat at that meal; null = any meal.
create or replace function trophe.recent_foods(p_meal text default null, p_limit integer default 12)
returns table (id uuid, name text, brand text, kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
               last_grams numeric, last_serving_label text, last_serving_qty numeric, last_logged_at timestamptz, uses bigint)
language sql
stable
set search_path = ''
as $$
  with last as (
    select distinct on (e.food_id) e.food_id, e.grams, e.serving_label, e.serving_qty, e.logged_at
    from trophe.diary_entries e
    where e.user_id = (select auth.uid()) and e.food_id is not null and (p_meal is null or e.meal = p_meal)
    order by e.food_id, e.logged_at desc, e.day desc, e.position desc
  )
  select f.id, f.name, f.brand, f.kcal, f.protein_g, f.carbs_g, f.fat_g,
         l.grams, l.serving_label, l.serving_qty, l.logged_at, 0::bigint
  from last l join trophe.foods f on f.id = l.food_id and f.archived_at is null
  order by l.logged_at desc
  limit least(greatest(p_limit, 1), 50)
$$;

-- The same shape, ranked by how often each food was logged in the last 60 days.
create or replace function trophe.frequent_foods(p_meal text default null, p_limit integer default 12)
returns table (id uuid, name text, brand text, kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric,
               last_grams numeric, last_serving_label text, last_serving_qty numeric, last_logged_at timestamptz, uses bigint)
language sql
stable
set search_path = ''
as $$
  with counted as (
    select e.food_id, count(*) uses, max(e.logged_at) last_at
    from trophe.diary_entries e
    where e.user_id = (select auth.uid()) and e.food_id is not null and (p_meal is null or e.meal = p_meal)
      and e.logged_at > now() - interval '60 days'
    group by e.food_id
  ), last as (
    select distinct on (e.food_id) e.food_id, e.grams, e.serving_label, e.serving_qty
    from trophe.diary_entries e join counted c on c.food_id = e.food_id
    where e.user_id = (select auth.uid())
    order by e.food_id, e.logged_at desc, e.day desc, e.position desc
  )
  select f.id, f.name, f.brand, f.kcal, f.protein_g, f.carbs_g, f.fat_g,
         l.grams, l.serving_label, l.serving_qty, c.last_at, c.uses
  from counted c join last l on l.food_id = c.food_id
  join trophe.foods f on f.id = c.food_id and f.archived_at is null
  order by c.uses desc, c.last_at desc
  limit least(greatest(p_limit, 1), 50)
$$;

-- ------------------------------------------------------------ search_foods --
-- Your own foods: every word must appear in name or brand (any order, any case).
-- Names starting with the query rank first, then the ones you log most.
-- Empty query = all foods A–Z (the Foods page).
create or replace function trophe.search_foods(p_query text default '', p_limit integer default 30, p_archived boolean default false)
returns setof trophe.foods
language sql
stable
set search_path = ''
as $$
  with q as (
    select array_agg(replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_')) ws
    from regexp_split_to_table(lower(btrim(coalesce(p_query, ''))), '\s+') w
    where w <> ''
  )
  select f.* from trophe.foods f, q
  where f.user_id = (select auth.uid())
    and (f.archived_at is not null) = p_archived
    and (q.ws is null or not exists (
          select 1 from unnest(q.ws) w
          where lower(f.name || ' ' || coalesce(f.brand, '')) not like '%' || w || '%'))
  order by (q.ws is not null and lower(f.name) like q.ws[1] || '%') desc,
           (select count(*) from trophe.diary_entries e where e.user_id = f.user_id and e.food_id = f.id) desc,
           lower(f.name)
  limit least(greatest(p_limit, 1), 200)
$$;

-- ------------------------------------------------------------ copy_entries --
-- Copy a day (or one meal of it) to another day/meal: "same breakfast as
-- yesterday". Food-based entries are re-logged from the food as it is now;
-- quick adds are copied as they were. Returns how many entries were added.
create or replace function trophe.copy_entries(p_from_day date, p_to_day date, p_meal text default null, p_to_meal text default null)
returns integer
language sql
volatile
set search_path = ''
as $$
  with ins as (
    insert into trophe.diary_entries (day, meal, food_id, name, brand, grams, serving_label, serving_qty,
                                      kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, position)
    select p_to_day, coalesce(p_to_meal, e.meal), e.food_id, e.name, e.brand, e.grams, e.serving_label, e.serving_qty,
           e.kcal, e.protein_g, e.carbs_g, e.fat_g, e.fiber_g, e.sugar_g, e.sodium_mg, e.position
    from trophe.diary_entries e
    where e.user_id = (select auth.uid()) and e.day = p_from_day and (p_meal is null or e.meal = p_meal)
    order by e.meal, e.position, e.logged_at
    returning 1
  )
  select count(*)::integer from ins
$$;

-- ------------------------------------------------------------- saved meals --
-- Save what was logged at one meal as a reusable "saved meal" (quick adds,
-- which have no food, are left out). Returns the new saved meal's id.
create or replace function trophe.save_meal_template(p_name text, p_day date, p_meal text)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare v_id uuid;
begin
  if not exists (select 1 from trophe.diary_entries e
                 where e.user_id = (select auth.uid()) and e.day = p_day and e.meal = p_meal and e.food_id is not null) then
    raise exception 'Nothing to save: log some foods to this meal first.' using errcode = 'P0001';
  end if;
  insert into trophe.meal_templates (name) values (btrim(p_name)) returning id into v_id;
  insert into trophe.meal_template_items (template_id, food_id, grams, serving_label, serving_qty, position)
  select v_id, e.food_id, e.grams, e.serving_label, e.serving_qty,
         (row_number() over (order by e.position, e.logged_at))::smallint
  from trophe.diary_entries e
  where e.user_id = (select auth.uid()) and e.day = p_day and e.meal = p_meal and e.food_id is not null;
  return v_id;
end
$$;

-- Log every item of a saved meal to a day + meal. Returns how many entries were added.
create or replace function trophe.log_meal_template(p_template uuid, p_day date, p_meal text)
returns integer
language sql
volatile
set search_path = ''
as $$
  with ins as (
    insert into trophe.diary_entries (day, meal, food_id, grams, serving_label, serving_qty, position)
    select p_day, p_meal, i.food_id, i.grams, i.serving_label, i.serving_qty, i.position
    from trophe.meal_template_items i
    join trophe.foods f on f.id = i.food_id and f.archived_at is null
    where i.user_id = (select auth.uid()) and i.template_id = p_template
    order by i.position
    returning 1
  )
  select count(*)::integer from ins
$$;

grant execute on function
  trophe.day_summary(date), trophe.range_summary(date, date),
  trophe.recent_foods(text, integer), trophe.frequent_foods(text, integer),
  trophe.search_foods(text, integer, boolean), trophe.copy_entries(date, date, text, text),
  trophe.save_meal_template(text, date, text), trophe.log_meal_template(uuid, date, text)
to authenticated;

commit;
