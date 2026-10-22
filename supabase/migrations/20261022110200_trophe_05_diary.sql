-- =============================================================================
-- Trophe 05 — diary entries and saved meals
-- History never changes: an entry keeps its OWN copy of the nutrients, taken
-- from the food when it is logged. Editing or archiving the food later, or
-- deleting it, leaves past days exactly as they were. Changing an entry's
-- grams rescales that copy, never re-reads the food.
-- An entry without a food is a "quick add" (name + calories typed directly).
-- =============================================================================
begin;

create table if not exists trophe.diary_entries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day           date not null,                 -- the user's local day (settings.timezone)
  -- breakfast / lunch / snacks / dinner today; any short slug later (custom meals)
  meal          text not null check (meal ~ '^[a-z][a-z0-9_-]{0,23}$'),
  food_id       uuid,
  name          text not null default '' check (char_length(name) <= 160),
  brand         text check (brand is null or char_length(brand) <= 120),
  grams         numeric(7,1) check (grams is null or (grams > 0 and grams <= 5000)),
  -- how it was entered, for display: "2 × 1 roti" (grams stays the source of truth)
  serving_label text check (serving_label is null or char_length(serving_label) <= 40),
  serving_qty   numeric(6,2) check (serving_qty is null or (serving_qty > 0 and serving_qty <= 1000)),
  -- totals for THIS entry (not per 100 g)
  kcal          numeric(7,1) not null default 0 check (kcal between 0 and 20000),
  protein_g     numeric(6,1) not null default 0 check (protein_g between 0 and 2000),
  carbs_g       numeric(6,1) not null default 0 check (carbs_g between 0 and 2000),
  fat_g         numeric(6,1) not null default 0 check (fat_g between 0 and 2000),
  fiber_g       numeric(6,1) check (fiber_g between 0 and 2000),
  sugar_g       numeric(6,1) check (sugar_g between 0 and 2000),
  sodium_mg     numeric(8,1) check (sodium_mg between 0 and 200000),
  position      integer not null default 0,
  logged_at     timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (food_id is null or grams is not null),
  -- deleting a food keeps the entry (and its copied numbers), only the link goes
  foreign key (food_id, user_id) references trophe.foods (id, user_id) on delete set null (food_id)
);

create index if not exists diary_user_day_idx  on trophe.diary_entries (user_id, day, meal, position, logged_at);
create index if not exists diary_user_food_idx on trophe.diary_entries (user_id, food_id, logged_at desc) where food_id is not null;

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
  end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end
$$;
drop trigger if exists diary_before_write on trophe.diary_entries;
create trigger diary_before_write
  before insert or update on trophe.diary_entries
  for each row execute function trophe.diary_before_write();

-- ------------------------------------------------------------ saved meals --
create table if not exists trophe.meal_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_templates_id_user_key unique (id, user_id)
);

create table if not exists trophe.meal_template_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  template_id   uuid not null,
  food_id       uuid not null,
  grams         numeric(7,1) not null check (grams > 0 and grams <= 5000),
  serving_label text check (serving_label is null or char_length(serving_label) <= 40),
  serving_qty   numeric(6,2) check (serving_qty is null or (serving_qty > 0 and serving_qty <= 1000)),
  position      smallint not null default 0,
  foreign key (template_id, user_id) references trophe.meal_templates (id, user_id) on delete cascade,
  foreign key (food_id, user_id)     references trophe.foods (id, user_id) on delete cascade
);
create index if not exists meal_template_items_tpl_idx on trophe.meal_template_items (template_id, position);

drop trigger if exists meal_templates_touch on trophe.meal_templates;
create trigger meal_templates_touch before insert or update on trophe.meal_templates
  for each row execute function trophe.touch_updated_at();

-- ================================================================== RLS ==
do $$
declare t text;
begin
  foreach t in array array['diary_entries', 'meal_templates', 'meal_template_items'] loop
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
revoke execute on function trophe.diary_before_write() from public, anon, authenticated;

commit;
