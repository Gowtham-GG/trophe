-- =============================================================================
-- Trophe 03 — foods, servings, body profile
-- A food stores nutrients PER 100 g (liquids: per 100 ml, treated as grams).
-- Servings ("1 roti = 40 g", "1 katori = 150 g") sit on top, so all maths
-- stays exact. Foods are never hard-deleted by the app: they are archived, so
-- recent/frequent lists and saved meals keep working.
-- =============================================================================
begin;

-- ------------------------------------------------- body profile (settings) --
-- Used by the goal wizard (BMR/TDEE). All optional.
alter table trophe.settings
  add column if not exists sex        text check (sex in ('male', 'female')),
  add column if not exists birth_year smallint check (birth_year between 1900 and 2100),
  add column if not exists height_cm  numeric(5,1) check (height_cm between 50 and 272),
  add column if not exists activity   text check (activity in ('sedentary', 'light', 'moderate', 'active', 'very_active'));

-- ------------------------------------------------------------------- foods --
create table if not exists trophe.foods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  brand       text check (brand is null or char_length(brand) <= 120),
  -- where the numbers came from: typed in, Open Food Facts, USDA, Indian food tables (Phase 2)
  source      text not null default 'custom' check (source in ('custom', 'off', 'usda', 'ifct')),
  external_id text check (external_id is null or char_length(external_id) <= 64),
  barcode     text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  -- per 100 g
  kcal        numeric(6,1) not null check (kcal between 0 and 950),
  protein_g   numeric(5,1) not null default 0 check (protein_g between 0 and 100),
  carbs_g     numeric(5,1) not null default 0 check (carbs_g between 0 and 100),
  fat_g       numeric(5,1) not null default 0 check (fat_g between 0 and 100),
  fiber_g     numeric(5,1) check (fiber_g between 0 and 100),
  sugar_g     numeric(5,1) check (sugar_g between 0 and 100),
  sodium_mg   numeric(7,1) check (sodium_mg between 0 and 40000),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint foods_id_user_key unique (id, user_id),
  -- 100 g of food can't hold more than ~100 g of macros (a little slack for label rounding)
  constraint foods_macros_fit check (protein_g + carbs_g + fat_g <= 105)
);

create index if not exists foods_user_name_idx on trophe.foods (user_id, lower(name)) where archived_at is null;
create index if not exists foods_barcode_idx   on trophe.foods (user_id, barcode) where barcode is not null;
-- one cached copy per external food (Phase 2 caches search results only when logged)
create unique index if not exists foods_external_key on trophe.foods (user_id, source, external_id) where external_id is not null;

-- ---------------------------------------------------------------- servings --
create table if not exists trophe.food_servings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  food_id    uuid not null,
  label      text not null check (char_length(btrim(label)) between 1 and 40),
  grams      numeric(7,1) not null check (grams > 0 and grams <= 5000),
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint food_servings_id_user_key unique (id, user_id),
  foreign key (food_id, user_id) references trophe.foods (id, user_id) on delete cascade
);
create index if not exists food_servings_food_idx on trophe.food_servings (food_id, position);

-- ---------------------------------------------------------------- triggers --
create or replace function trophe.foods_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name  := btrim(new.name);
  new.brand := nullif(btrim(new.brand), '');
  new.updated_at := now();
  if tg_op = 'UPDATE' then new.created_at := old.created_at; end if;
  return new;
end
$$;
drop trigger if exists foods_before_write on trophe.foods;
create trigger foods_before_write
  before insert or update on trophe.foods
  for each row execute function trophe.foods_before_write();

create or replace function trophe.food_servings_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.label := btrim(new.label);
  return new;
end
$$;
drop trigger if exists food_servings_before_write on trophe.food_servings;
create trigger food_servings_before_write
  before insert or update on trophe.food_servings
  for each row execute function trophe.food_servings_before_write();

-- ================================================================== RLS ==
do $$
declare t text;
begin
  foreach t in array array['foods', 'food_servings'] loop
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
revoke execute on function trophe.foods_before_write() from public, anon, authenticated;
revoke execute on function trophe.food_servings_before_write() from public, anon, authenticated;

commit;
