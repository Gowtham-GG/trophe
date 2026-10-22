-- =============================================================================
-- Trophe 09 — quick add by typing ("2 roti dal lunch")
-- The parser runs in the browser (src/lib/quickLog.ts); this hands it every
-- active food in one call, with its servings and the amount you had last time,
-- most logged first so ties go to what you actually eat.
-- =============================================================================
begin;

create or replace function trophe.quick_log_foods(p_limit integer default 500)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with uses as (
    select e.food_id, count(*) as n
    from trophe.diary_entries e
    where e.user_id = (select auth.uid()) and e.food_id is not null
    group by e.food_id
  ), last as (
    select distinct on (e.food_id) e.food_id, e.grams, e.serving_label, e.serving_qty
    from trophe.diary_entries e
    where e.user_id = (select auth.uid()) and e.food_id is not null
    order by e.food_id, e.logged_at desc, e.day desc, e.position desc
  ), picked as (
    select f.id, f.name, f.brand, f.source, f.external_id, f.kcal, f.protein_g, f.carbs_g, f.fat_g, f.fiber_g,
           coalesce(u.n, 0) as uses,
           (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label, 'grams', s.grams) order by s.position, s.created_at), '[]'::jsonb)
              from trophe.food_servings s where s.food_id = f.id) as servings,
           case when l.food_id is null then null
                else jsonb_build_object('grams', l.grams, 'serving_label', l.serving_label, 'serving_qty', l.serving_qty) end as last
    from trophe.foods f
    left join uses u on u.food_id = f.id
    left join last l on l.food_id = f.id
    where f.user_id = (select auth.uid()) and f.archived_at is null
    order by coalesce(u.n, 0) desc, lower(f.name)
    limit least(greatest(p_limit, 1), 1000)
  )
  select coalesce(jsonb_agg(to_jsonb(p) order by p.uses desc, lower(p.name)), '[]'::jsonb) from picked p
$$;

-- see migration 07: no function is executable by anon / PUBLIC
revoke execute on all functions in schema trophe from public, anon;
grant execute on all functions in schema trophe to authenticated;
revoke execute on function trophe.settings_before_write(), trophe.foods_before_write(), trophe.food_servings_before_write(),
                           trophe.touch_updated_at(), trophe.diary_before_write()
  from authenticated;

commit;
