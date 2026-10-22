-- =============================================================================
-- Trophe 15 — micronutrients
-- Iron, calcium, potassium, magnesium, zinc and vitamins A, C, D, B12, folate,
-- kept as one jsonb per food (per 100 g, like everything else) and copied onto
-- each diary entry scaled to its grams, so history never changes. Only the
-- known keys, with non-negative numbers, are accepted. Foods without data
-- simply have none: the day view says how many foods its totals cover.
-- =============================================================================
begin;

create or replace function trophe.micros_ok(m jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select m is null or (jsonb_typeof(m) = 'object' and not exists (
    select 1 from jsonb_each(m) x
    where x.key not in ('iron_mg', 'calcium_mg', 'potassium_mg', 'magnesium_mg', 'zinc_mg',
                        'vitamin_a_ug', 'vitamin_c_mg', 'vitamin_d_ug', 'vitamin_b12_ug', 'folate_ug')
       or case when jsonb_typeof(x.value) <> 'number' then true else (x.value)::numeric < 0 or (x.value)::numeric > 100000 end))
$$;

-- every value × r, rounded (null in, null out)
create or replace function trophe.micros_scale(m jsonb, r numeric)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when m is null or m = '{}'::jsonb then null
              else (select jsonb_object_agg(x.key, round((x.value)::numeric * r, 3)) from jsonb_each(m) x) end
$$;

alter table trophe.foods add column if not exists micros jsonb;
alter table trophe.foods drop constraint if exists foods_micros_ok;
alter table trophe.foods add constraint foods_micros_ok check (trophe.micros_ok(micros));
alter table trophe.diary_entries add column if not exists micros jsonb;
alter table trophe.diary_entries drop constraint if exists diary_micros_ok;
alter table trophe.diary_entries add constraint diary_micros_ok check (trophe.micros_ok(micros));

-- the diary copies (and rescales) micronutrients exactly like the other nutrients (see migration 05)
create or replace function trophe.diary_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  f trophe.foods;
  r numeric;
begin
  if tg_op = 'INSERT' or new.food_id is distinct from old.food_id then
    if new.food_id is not null then
      -- copy from the food (RLS: only the user's own foods are visible here)
      select * into f from trophe.foods where id = new.food_id;
      if not found then raise exception 'That food doesn''t exist.' using errcode = 'P0001'; end if;
      if new.grams is null then raise exception 'Say how much you had.' using errcode = 'P0001'; end if;
      r := new.grams / 100;
      new.name      := f.name;
      new.brand     := f.brand;
      new.kcal      := round(f.kcal * r, 1);
      new.protein_g := round(f.protein_g * r, 1);
      new.carbs_g   := round(f.carbs_g * r, 1);
      new.fat_g     := round(f.fat_g * r, 1);
      new.fiber_g   := round(f.fiber_g * r, 1);
      new.sugar_g   := round(f.sugar_g * r, 1);
      new.sodium_mg := round(f.sodium_mg * r, 1);
      new.micros    := trophe.micros_scale(f.micros, r);
    elsif tg_op = 'INSERT' then
      new.name := coalesce(nullif(btrim(new.name), ''), 'Quick add');
    end if;
    -- (food deleted: food_id just became null — keep every copied number)
  elsif new.grams is distinct from old.grams and old.grams is not null and new.grams is not null then
    -- rescale this entry's own copy, never the (possibly edited) food
    r := new.grams / old.grams;
    new.kcal      := round(old.kcal * r, 1);
    new.protein_g := round(old.protein_g * r, 1);
    new.carbs_g   := round(old.carbs_g * r, 1);
    new.fat_g     := round(old.fat_g * r, 1);
    new.fiber_g   := round(old.fiber_g * r, 1);
    new.sugar_g   := round(old.sugar_g * r, 1);
    new.sodium_mg := round(old.sodium_mg * r, 1);
    new.micros    := trophe.micros_scale(old.micros, r);
  end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end
$$;

-- recipes add up their ingredients' micronutrients too (see migration 10; only the micros lines are new)
create or replace function trophe.recipe_recompute(p_recipe uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  r trophe.foods;
  t record;
  m jsonb;
  cooked numeric;
  k numeric;
begin
  select * into r from trophe.foods where id = p_recipe and source = 'recipe';
  if not found then return; end if;

  select coalesce(sum(i.grams), 0) as raw,
         sum(f.kcal * i.grams / 100) as kcal, sum(f.protein_g * i.grams / 100) as protein_g,
         sum(f.carbs_g * i.grams / 100) as carbs_g, sum(f.fat_g * i.grams / 100) as fat_g,
         sum(f.fiber_g * i.grams / 100) as fiber_g, sum(f.sugar_g * i.grams / 100) as sugar_g,
         sum(f.sodium_mg * i.grams / 100) as sodium_mg
    into t
    from trophe.recipe_items i join trophe.foods f on f.id = i.food_id
   where i.recipe_id = p_recipe;
  if t.raw = 0 then raise exception 'Add at least one ingredient.' using errcode = 'P0001'; end if;

  cooked := coalesce(r.recipe_cooked_g, t.raw);
  k := 100 / cooked;
  if t.kcal * k > 950 or t.protein_g * k > 100 or t.carbs_g * k > 100 or t.fat_g * k > 100
     or (t.protein_g + t.carbs_g + t.fat_g) * k > 105 or coalesce(t.fiber_g, 0) * k > 100 or coalesce(t.sugar_g, 0) * k > 100 then
    raise exception 'The cooked weight is too low for these ingredients. Weigh everything in the pot after cooking (without the pot).'
      using errcode = 'P0001';
  end if;
  if r.recipe_portions is not null and cooked / r.recipe_portions > 5000 then
    raise exception 'A portion can''t be more than 5 kg. Add more portions.' using errcode = 'P0001';
  end if;

  -- per nutrient: the sum over the ingredients that list it
  select jsonb_object_agg(x.key, round(x.total * k, 3)) into m from (
    select mi.key, sum((mi.value)::numeric * i.grams / 100) as total
    from trophe.recipe_items i join trophe.foods f on f.id = i.food_id, jsonb_each(coalesce(f.micros, '{}'::jsonb)) mi
    where i.recipe_id = p_recipe group by mi.key) x;

  update trophe.foods set
    kcal = round(t.kcal * k, 1), protein_g = round(t.protein_g * k, 1), carbs_g = round(t.carbs_g * k, 1), fat_g = round(t.fat_g * k, 1),
    fiber_g = round(t.fiber_g * k, 1), sugar_g = round(t.sugar_g * k, 1), sodium_mg = least(round(t.sodium_mg * k, 1), 40000),
    micros = m
  where id = p_recipe;

  delete from trophe.food_servings where food_id = p_recipe and label = '1 portion';
  if r.recipe_portions is not null then
    insert into trophe.food_servings (food_id, label, grams, position) values (p_recipe, '1 portion', round(cooked / r.recipe_portions, 1), 0);
  end if;
end
$$;

-- an ingredient's micronutrients changing updates its recipes as well
drop trigger if exists foods_after_update on trophe.foods;
create trigger foods_after_update
  after update of kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, micros on trophe.foods
  for each row
  when ((old.kcal, old.protein_g, old.carbs_g, old.fat_g, old.fiber_g, old.sugar_g, old.sodium_mg, old.micros)
        is distinct from (new.kcal, new.protein_g, new.carbs_g, new.fat_g, new.fiber_g, new.sugar_g, new.sodium_mg, new.micros))
  execute function trophe.foods_after_update();

-- online foods bring their micronutrients when they have them (see migration 08; only micros is new)
create or replace function trophe.save_external_food(p_food jsonb, p_servings jsonb default '[]'::jsonb)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_source text := p_food->>'source';
  v_ext text := nullif(btrim(p_food->>'external_id'), '');
begin
  if v_source not in ('off', 'usda', 'ifct') or v_ext is null then
    raise exception 'Not an online food.' using errcode = 'P0001';
  end if;

  select f.id into v_id from trophe.foods f
  where f.user_id = v_uid and f.source = v_source and f.external_id = v_ext;
  if found then
    update trophe.foods set archived_at = null where id = v_id and archived_at is not null;
    return v_id;
  end if;

  insert into trophe.foods (name, brand, source, external_id, barcode, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, micros)
  values (
    left(btrim(p_food->>'name'), 120),
    left(nullif(btrim(p_food->>'brand'), ''), 120),
    v_source, left(v_ext, 64),
    nullif(p_food->>'barcode', ''),
    (p_food->>'kcal')::numeric,
    coalesce((p_food->>'protein_g')::numeric, 0),
    coalesce((p_food->>'carbs_g')::numeric, 0),
    coalesce((p_food->>'fat_g')::numeric, 0),
    (p_food->>'fiber_g')::numeric,
    (p_food->>'sugar_g')::numeric,
    (p_food->>'sodium_mg')::numeric,
    case when jsonb_typeof(p_food->'micros') = 'object' and p_food->'micros' <> '{}'::jsonb then p_food->'micros' end
  )
  -- two tabs logging the same food at once: the second one just finds the first
  on conflict (user_id, source, external_id) where external_id is not null do nothing
  returning id into v_id;

  if v_id is null then
    select f.id into v_id from trophe.foods f where f.user_id = v_uid and f.source = v_source and f.external_id = v_ext;
    return v_id;
  end if;

  insert into trophe.food_servings (food_id, label, grams, position)
  select v_id, left(btrim(s->>'label'), 40), (s->>'grams')::numeric, (row_number() over ())::smallint
  from jsonb_array_elements(coalesce(p_servings, '[]'::jsonb)) s
  where nullif(btrim(s->>'label'), '') is not null and (s->>'grams')::numeric > 0 and (s->>'grams')::numeric <= 5000
  limit 8;

  return v_id;
end
$$;

-- micronutrients (and sugar, sodium) over [p_from, p_to]: the average per logged day, and how many of the
-- logged entries carried micronutrient data at all (totals from part of the day understate it)
create or replace function trophe.micros_summary(p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with e as (
    select * from trophe.diary_entries
    where user_id = (select auth.uid()) and day between p_from and p_to
  ), days as (select count(distinct day) as n from e)
  select jsonb_build_object(
    'logged_days', (select n from days),
    'entries', (select count(*) from e),
    'with_micros', (select count(*) from e where micros is not null),
    'sugar_g', (select round(sum(sugar_g) / nullif((select n from days), 0), 1) from e),
    'sodium_mg', (select round(sum(sodium_mg) / nullif((select n from days), 0)) from e),
    'micros', coalesce((select jsonb_object_agg(x.key, round(x.total / (select n from days), 2))
                        from (select mi.key, sum((mi.value)::numeric) as total from e, jsonb_each(e.micros) mi group by mi.key) x), '{}'::jsonb)
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
