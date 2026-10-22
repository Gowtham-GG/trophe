-- =============================================================================
-- Trophe 08 — keep a food found online (Open Food Facts / USDA / Indian list)
-- Search results are never stored; a food is copied into the user's foods
-- only when they log it (or open it), so storage grows with what they eat.
-- Saving the same external food again returns the existing copy: the user's
-- own edits to it are never overwritten, and an archived copy comes back.
-- =============================================================================
begin;

-- p_food: {source, external_id, name, brand, barcode, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg}
-- p_servings: [{label, grams}, …] (only used when the food is new)
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

  insert into trophe.foods (name, brand, source, external_id, barcode, kcal, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg)
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
    (p_food->>'sodium_mg')::numeric
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

-- see migration 07: no function is executable by anon / PUBLIC
revoke execute on all functions in schema trophe from public, anon;
grant execute on all functions in schema trophe to authenticated;
revoke execute on function trophe.settings_before_write(), trophe.foods_before_write(), trophe.food_servings_before_write(),
                           trophe.touch_updated_at(), trophe.diary_before_write()
  from authenticated;

commit;
