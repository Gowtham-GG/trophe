-- =============================================================================
-- Trophe 10 — recipes
-- A recipe is a food (source 'recipe') whose numbers per 100 g are worked out
-- here from its ingredients and the cooked weight (water boils off, so 100 g
-- cooked is not 100 g raw). "1 portion" = cooked weight / portions becomes its
-- first serving, so it's logged like any food (and the diary copies the numbers
-- as always: history never changes). Editing an ingredient's nutrients updates
-- the recipes that use it. Recipes can't be ingredients (no loops).
-- =============================================================================
begin;

alter table trophe.foods drop constraint if exists foods_source_check;
alter table trophe.foods add constraint foods_source_check check (source in ('custom', 'off', 'usda', 'ifct', 'recipe'));

alter table trophe.foods
  -- the whole pot after cooking, in grams (null: the raw ingredients' total)
  add column if not exists recipe_cooked_g  numeric(8,1) check (recipe_cooked_g is null or (recipe_cooked_g > 0 and recipe_cooked_g <= 100000)),
  add column if not exists recipe_portions  smallint check (recipe_portions is null or recipe_portions between 1 and 100);

create table if not exists trophe.recipe_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recipe_id     uuid not null,
  food_id       uuid not null,
  grams         numeric(7,1) not null check (grams > 0 and grams <= 5000),
  -- how it was entered, for the form: "2 × 1 katori"
  serving_label text check (serving_label is null or char_length(serving_label) <= 40),
  serving_qty   numeric(6,2) check (serving_qty is null or (serving_qty > 0 and serving_qty <= 1000)),
  position      smallint not null default 0,
  created_at    timestamptz not null default now(),
  check (recipe_id <> food_id),
  constraint recipe_items_recipe_fkey foreign key (recipe_id, user_id) references trophe.foods (id, user_id) on delete cascade,
  -- deleting an ingredient food drops it from the recipe; the recipe keeps its numbers until it's saved again
  constraint recipe_items_food_fkey   foreign key (food_id, user_id)   references trophe.foods (id, user_id) on delete cascade
);
create index if not exists recipe_items_recipe_idx on trophe.recipe_items (recipe_id, position);
create index if not exists recipe_items_food_idx on trophe.recipe_items (food_id);

alter table trophe.recipe_items enable row level security;
drop policy if exists recipe_items_owner on trophe.recipe_items;
create policy recipe_items_owner on trophe.recipe_items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on trophe.recipe_items to authenticated;

-- only real foods go into a recipe, and only into a recipe
create or replace function trophe.recipe_items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from trophe.foods f where f.id = new.recipe_id and f.source = 'recipe') then
    raise exception 'That isn''t a recipe.' using errcode = 'P0001';
  end if;
  if exists (select 1 from trophe.foods f where f.id = new.food_id and f.source = 'recipe') then
    raise exception 'A recipe can''t be an ingredient of another recipe.' using errcode = 'P0001';
  end if;
  return new;
end
$$;
drop trigger if exists recipe_items_before_write on trophe.recipe_items;
create trigger recipe_items_before_write
  before insert or update on trophe.recipe_items
  for each row execute function trophe.recipe_items_before_write();

-- ------------------------------------------------- the numbers of a recipe --
-- per 100 g = (sum of each ingredient's nutrients for its grams) / cooked weight × 100
create or replace function trophe.recipe_recompute(p_recipe uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  r trophe.foods;
  t record;
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

  update trophe.foods set
    kcal = round(t.kcal * k, 1), protein_g = round(t.protein_g * k, 1), carbs_g = round(t.carbs_g * k, 1), fat_g = round(t.fat_g * k, 1),
    fiber_g = round(t.fiber_g * k, 1), sugar_g = round(t.sugar_g * k, 1), sodium_mg = least(round(t.sodium_mg * k, 1), 40000)
  where id = p_recipe;

  delete from trophe.food_servings where food_id = p_recipe and label = '1 portion';
  if r.recipe_portions is not null then
    insert into trophe.food_servings (food_id, label, grams, position) values (p_recipe, '1 portion', round(cooked / r.recipe_portions, 1), 0);
  end if;
end
$$;

-- an ingredient's numbers changed: its recipes follow (a recipe that would become impossible keeps its last numbers)
create or replace function trophe.foods_after_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare rid uuid;
begin
  for rid in select distinct i.recipe_id from trophe.recipe_items i where i.food_id = new.id loop
    begin
      perform trophe.recipe_recompute(rid);
    exception when sqlstate 'P0001' then null;
    end;
  end loop;
  return null;
end
$$;
drop trigger if exists foods_after_update on trophe.foods;
create trigger foods_after_update
  after update of kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg on trophe.foods
  for each row
  when ((old.kcal, old.protein_g, old.carbs_g, old.fat_g, old.fiber_g, old.sugar_g, old.sodium_mg)
        is distinct from (new.kcal, new.protein_g, new.carbs_g, new.fat_g, new.fiber_g, new.sugar_g, new.sodium_mg))
  execute function trophe.foods_after_update();

-- ------------------------------------------------------------- save_recipe --
-- p_items: [{food_id, grams, serving_label?, serving_qty?}, …] in order. p_id null = a new recipe.
create or replace function trophe.save_recipe(p_id uuid, p_name text, p_items jsonb, p_cooked_g numeric default null, p_portions integer default null)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_id uuid := p_id;
begin
  if nullif(btrim(coalesce(p_name, '')), '') is null then raise exception 'Give the recipe a name.' using errcode = 'P0001'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one ingredient.' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > 60 then raise exception 'A recipe can have up to 60 ingredients.' using errcode = 'P0001'; end if;

  if v_id is null then
    insert into trophe.foods (name, source, kcal, recipe_cooked_g, recipe_portions)
    values (left(btrim(p_name), 120), 'recipe', 0, p_cooked_g, p_portions)
    returning id into v_id;
  else
    update trophe.foods set name = left(btrim(p_name), 120), recipe_cooked_g = p_cooked_g, recipe_portions = p_portions
    where id = v_id and source = 'recipe';
    if not found then raise exception 'That recipe doesn''t exist.' using errcode = 'P0001'; end if;
    delete from trophe.recipe_items where recipe_id = v_id;
  end if;

  -- RLS: an ingredient that isn't the user's own food fails the foreign key
  insert into trophe.recipe_items (recipe_id, food_id, grams, serving_label, serving_qty, position)
  select v_id, (it->>'food_id')::uuid, (it->>'grams')::numeric, nullif(btrim(it->>'serving_label'), ''), (it->>'serving_qty')::numeric, (n - 1)::smallint
  from jsonb_array_elements(p_items) with ordinality as x(it, n);

  perform trophe.recipe_recompute(v_id);
  return v_id;
end
$$;

-- see migration 07: no function is executable by anon / PUBLIC
revoke execute on all functions in schema trophe from public, anon;
grant execute on all functions in schema trophe to authenticated;
revoke execute on function trophe.settings_before_write(), trophe.foods_before_write(), trophe.food_servings_before_write(),
                           trophe.touch_updated_at(), trophe.diary_before_write(), trophe.recipe_items_before_write(),
                           trophe.foods_after_update()
  from authenticated;

commit;
