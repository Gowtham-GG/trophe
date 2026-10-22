-- =============================================================================
-- Trophe 17 — meal plans and grocery lists
-- Plan foods for any day and meal (same foods, servings and amounts as the
-- diary). A planned meal is logged with one tap: its items move into the
-- diary (where the nutrients are copied as always). The grocery list adds up
-- a range of the plan by food, opening planned recipes into their ingredients
-- (scaled by how much of the cooked pot is planned), with a tick per item.
-- =============================================================================
begin;

create table if not exists trophe.plan_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day           date not null,
  meal          text not null check (meal ~ '^[a-z][a-z0-9_-]{0,23}$'),
  food_id       uuid not null,
  grams         numeric(7,1) not null check (grams > 0 and grams <= 5000),
  serving_label text check (serving_label is null or char_length(serving_label) <= 40),
  serving_qty   numeric(6,2) check (serving_qty is null or (serving_qty > 0 and serving_qty <= 1000)),
  position      smallint not null default 0,
  created_at    timestamptz not null default now(),
  constraint plan_items_food_fkey foreign key (food_id, user_id) references trophe.foods (id, user_id) on delete cascade
);
create index if not exists plan_items_user_day_idx on trophe.plan_items (user_id, day);

-- what's been ticked off on a grocery list (a list is a date range: "2026-10-26..2026-11-01")
create table if not exists trophe.grocery_checks (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  list_key text not null check (list_key ~ '^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$'),
  food_id  uuid not null,
  primary key (user_id, list_key, food_id),
  constraint grocery_checks_food_fkey foreign key (food_id, user_id) references trophe.foods (id, user_id) on delete cascade
);

do $$
declare t text;
begin
  foreach t in array array['plan_items', 'grocery_checks'] loop
    execute format('alter table trophe.%I enable row level security', t);
    execute format('drop policy if exists %I on trophe.%I', t || '_owner', t);
    execute format(
      'create policy %I on trophe.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))',
      t || '_owner', t);
  end loop;
end $$;
grant select, insert, update, delete on trophe.plan_items, trophe.grocery_checks to authenticated;

-- a saved meal into the plan (like log_meal_template, migration 06)
create or replace function trophe.plan_template(p_template uuid, p_day date, p_meal text)
returns integer
language sql
volatile
set search_path = ''
as $$
  with ins as (
    insert into trophe.plan_items (day, meal, food_id, grams, serving_label, serving_qty, position)
    select p_day, p_meal, i.food_id, i.grams, i.serving_label, i.serving_qty, i.position
    from trophe.meal_template_items i
    join trophe.foods f on f.id = i.food_id and f.archived_at is null
    where i.user_id = (select auth.uid()) and i.template_id = p_template
    order by i.position
    returning 1
  )
  select count(*)::integer from ins
$$;

-- log a planned day (or one meal of it): the items move into the diary
create or replace function trophe.log_plan(p_day date, p_meal text default null)
returns integer
language sql
volatile
set search_path = ''
as $$
  with moved as (
    delete from trophe.plan_items p
    where p.user_id = (select auth.uid()) and p.day = p_day and (p_meal is null or p.meal = p_meal)
    returning p.day, p.meal, p.food_id, p.grams, p.serving_label, p.serving_qty, p.position
  ), ins as (
    insert into trophe.diary_entries (day, meal, food_id, grams, serving_label, serving_qty, position)
    select day, meal, food_id, grams, serving_label, serving_qty, position from moved
    returning 1
  )
  select count(*)::integer from ins
$$;

-- each day of [p_from, p_to]: what the plan adds up to (at the foods' current numbers) and that day's goal
create or replace function trophe.plan_days(p_from date, p_to date)
returns table (day date, items integer, kcal numeric, protein_g numeric, carbs_g numeric, fat_g numeric, goal_kcal integer)
language sql
stable
set search_path = ''
as $$
  select d::date, count(p.id)::integer,
         coalesce(round(sum(f.kcal * p.grams / 100)), 0), coalesce(round(sum(f.protein_g * p.grams / 100), 1), 0),
         coalesce(round(sum(f.carbs_g * p.grams / 100), 1), 0), coalesce(round(sum(f.fat_g * p.grams / 100), 1), 0),
         (select gf.kcal from trophe.goal_for(d::date) gf)
  from generate_series(p_from, least(p_to, p_from + 62), interval '1 day') d
  left join trophe.plan_items p on p.user_id = (select auth.uid()) and p.day = d::date
  left join trophe.foods f on f.id = p.food_id
  group by d
  order by d
$$;

-- what to buy for [p_from, p_to]: grams per food, recipes opened into their ingredients
create or replace function trophe.grocery_list(p_from date, p_to date)
returns table (food_id uuid, name text, brand text, grams numeric, for_recipes text[], serving_label text, serving_grams numeric, checked boolean)
language sql
stable
set search_path = ''
as $$
  with planned as (
    select p.food_id, sum(p.grams) as g
    from trophe.plan_items p where p.user_id = (select auth.uid()) and p.day between p_from and p_to
    group by p.food_id
  ), expanded as (
    select p.food_id, p.g as grams, null::text as via
    from planned p join trophe.foods f on f.id = p.food_id where f.source <> 'recipe'
    union all
    -- a recipe: each ingredient × the share of the cooked pot that's planned
    select i.food_id, p.g * i.grams / coalesce(r.recipe_cooked_g, (select sum(x.grams) from trophe.recipe_items x where x.recipe_id = r.id)), r.name
    from planned p join trophe.foods r on r.id = p.food_id and r.source = 'recipe'
    join trophe.recipe_items i on i.recipe_id = r.id
  )
  select e.food_id, f.name, f.brand, round(sum(e.grams)), array_remove(array_agg(distinct e.via), null),
         s.label, s.grams,
         exists (select 1 from trophe.grocery_checks c
                 where c.user_id = (select auth.uid()) and c.list_key = p_from || '..' || p_to and c.food_id = e.food_id)
  from expanded e
  join trophe.foods f on f.id = e.food_id
  left join lateral (select fs.label, fs.grams from trophe.food_servings fs where fs.food_id = f.id order by fs.position, fs.created_at limit 1) s on true
  group by e.food_id, f.name, f.brand, s.label, s.grams
  order by lower(f.name)
$$;

-- see migration 07: no function is executable by anon / PUBLIC
revoke execute on all functions in schema trophe from public, anon;
grant execute on all functions in schema trophe to authenticated;
revoke execute on function trophe.settings_before_write(), trophe.foods_before_write(), trophe.food_servings_before_write(),
                           trophe.touch_updated_at(), trophe.diary_before_write(), trophe.recipe_items_before_write(),
                           trophe.foods_after_update()
  from authenticated;

commit;
