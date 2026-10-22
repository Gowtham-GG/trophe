-- =============================================================================
-- Trophe 19 — export and backup
-- export_backup(): everything of yours as one JSON document (no user ids).
-- restore_backup(doc): adds back what's missing — into this account or a new
-- one — and never changes or deletes what's there (on conflict do nothing).
-- Columns a backup lacks (an older version) take their defaults. Diary entries
-- keep their own numbers: while restoring, diary_before_write doesn't recopy
-- them from the (possibly since edited) food. Only restore_backup sets that
-- flag; it can't be set through the API, and it allows nothing a quick add
-- doesn't already (an entry with numbers of your choosing).
-- =============================================================================
begin;

-- tables in the order a restore needs (a row's references come first)
create or replace function trophe.backup_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['settings', 'foods', 'food_servings', 'recipe_items', 'meal_templates', 'meal_template_items', 'goals',
               'weigh_ins', 'measurements', 'water_entries', 'diary_entries', 'fasts', 'plan_items', 'grocery_checks']
$$;

create or replace function trophe.export_backup()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  t text;
  rows jsonb;
  tables jsonb := '{}'::jsonb;
begin
  foreach t in array trophe.backup_tables() loop
    -- RLS: only the caller's rows
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - ''user_id''), ''[]''::jsonb) from trophe.%I x', t) into rows;
    tables := tables || jsonb_build_object(t, rows);
  end loop;
  return jsonb_build_object('app', 'trophe', 'version', 1, 'exported_at', now(), 'tables', tables);
end
$$;

create or replace function trophe.restore_backup(p_doc jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  t text;
  rows jsonb;
  cols text;
  n integer;
  added jsonb := '{}'::jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if p_doc->>'app' is distinct from 'trophe' or jsonb_typeof(p_doc->'tables') <> 'object' then
    raise exception 'That isn''t a Trophe backup.' using errcode = 'P0001';
  end if;
  if (p_doc->>'version')::int > 1 then
    raise exception 'That backup is from a newer Trophe. Update the app first.' using errcode = 'P0001';
  end if;
  perform set_config('trophe.restoring', 'on', true);
  foreach t in array trophe.backup_tables() loop
    rows := p_doc->'tables'->t;
    if rows is null or jsonb_typeof(rows) <> 'array' or jsonb_array_length(rows) = 0 then continue; end if;
    -- the table's columns the backup has (user_id always comes from the signed-in user)
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
    from pg_attribute a
    where a.attrelid = format('trophe.%I', t)::regclass and a.attnum > 0 and not a.attisdropped and a.attname <> 'user_id'
      and exists (select 1 from jsonb_array_elements(rows) e where e ? a.attname);
    if cols is null then continue; end if;
    execute format('insert into trophe.%I (%s) select %s from jsonb_populate_recordset(null::trophe.%I, $1) on conflict do nothing', t, cols, cols, t)
      using rows;
    get diagnostics n = row_count;
    added := added || jsonb_build_object(t, n);
  end loop;
  perform set_config('trophe.restoring', 'off', true);
  return added;
end
$$;

-- the diary trigger of migration 15, plus the restoring case at the top
create or replace function trophe.diary_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  f trophe.foods;
  r numeric;
begin
  -- restoring a backup (restore_backup only): keep the entry's own numbers, as they were when it was logged
  if tg_op = 'INSERT' and current_setting('trophe.restoring', true) = 'on' then
    new.updated_at := now();
    return new;
  end if;
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

-- see migration 07: no function is executable by anon / PUBLIC
revoke execute on all functions in schema trophe from public, anon;
grant execute on all functions in schema trophe to authenticated;
revoke execute on function trophe.settings_before_write(), trophe.foods_before_write(), trophe.food_servings_before_write(),
                           trophe.touch_updated_at(), trophe.diary_before_write(), trophe.recipe_items_before_write(),
                           trophe.foods_after_update()
  from authenticated;

commit;
