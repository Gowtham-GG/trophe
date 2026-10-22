-- =============================================================================
-- Trophe SQL test-suite.  Run against a THROWAWAY database only (it creates
-- auth.users rows), never against the production project:
--     npm run test:sql
-- Everything runs in one transaction that is rolled back at the end.
-- =============================================================================
\set ON_ERROR_STOP on
begin;

create schema t;
grant usage on schema t to authenticated, anon;

create function t.ok(c boolean, msg text) returns void language plpgsql as $$
begin
  if c is not true then raise exception 'FAIL: %', msg; end if;
  raise notice 'ok   - %', msg;
end $$;

create function t.login(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

create function t.anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
end $$;

create function t.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- true when running the statement raises any error
create function t.throws(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;

create function t.n(q text) returns bigint language plpgsql as $$
declare r bigint; begin execute q into r; return r; end $$;

grant execute on all functions in schema t to authenticated, anon;

-- scratch key/value store for ids shared between DO blocks
create table t.kv (k text primary key, v text);
grant all on t.kv to authenticated;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test');

-- ============================================================ 1. settings ===
do $$
declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; b uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
begin
  perform t.login(a);
  insert into trophe.settings (timezone) values ('Asia/Kolkata');
  perform t.ok((select user_id from trophe.settings) = a, 'user_id defaults to the signed-in user');
  perform t.ok((select theme from trophe.settings) = 'jade', 'theme defaults to jade');
  perform t.ok(t.throws($q$ update trophe.settings set timezone = 'Mars/Olympus' $q$), 'invalid timezone rejected');
  update trophe.settings set theme = 'ember';
  perform t.ok((select theme from trophe.settings) = 'ember', 'any well-formed theme id is accepted (themes live in the app)');
  perform t.ok(t.throws($q$ update trophe.settings set theme = 'Robert''); drop table x;--' $q$), 'malformed theme values are rejected');
  perform t.ok(t.throws($q$ update trophe.settings set theme = '' $q$), 'empty theme rejected');
  -- the app's upsert, a second time: updates instead of duplicating
  insert into trophe.settings (theme) values ('sand') on conflict (user_id) do update set theme = excluded.theme;
  perform t.ok(t.n('select count(*) from trophe.settings') = 1 and (select theme from trophe.settings) = 'sand', 'upsert keeps one row per user');
  perform t.logout();
end $$;

-- ===================================================== 2. tenant isolation ==
do $$
declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; b uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
begin
  perform t.login(b);
  perform t.ok(t.n('select count(*) from trophe.settings') = 0, 'B cannot see A''s settings');
  update trophe.settings set theme = 'crimson' where user_id = a;
  delete from trophe.settings where user_id = a;
  perform t.ok(t.throws(format($q$ insert into trophe.settings (user_id, timezone) values (%L, 'UTC') $q$, a)), 'B cannot create a row for A');
  insert into trophe.settings (timezone) values ('UTC');
  perform t.ok(t.throws(format($q$ update trophe.settings set user_id = %L $q$, a)), 'B cannot hand its row over to A');
  perform t.logout();

  perform t.ok((select theme from trophe.settings where user_id = a) = 'sand', 'A''s row survived B''s update and delete');
  perform t.ok(t.n('select count(*) from trophe.settings') = 2, 'two rows, one per user');
end $$;

-- =========================================================== 3. anonymous ===
do $$
begin
  perform t.anon();
  perform t.ok(t.throws('select count(*) from trophe.settings'), 'anon cannot read the schema');
  perform t.ok(t.throws($q$ insert into trophe.settings (timezone) values ('UTC') $q$), 'anon cannot write');
  perform t.logout();
end $$;

-- ================================================================ 5. foods ==
do $$
declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; f uuid;
begin
  perform t.login(a);
  insert into trophe.foods (name, brand, kcal, protein_g, carbs_g, fat_g, fiber_g)
    values ('  Chapati  ', '  ', 297, 11, 46, 7.5, 9) returning id into f;
  perform t.ok((select name from trophe.foods where id = f) = 'Chapati', 'food name is trimmed');
  perform t.ok((select brand from trophe.foods where id = f) is null, 'blank brand becomes null');
  perform t.ok(t.throws($q$ insert into trophe.foods (name, kcal, protein_g, carbs_g, fat_g) values ('impossible', 400, 60, 40, 20) $q$), 'macros over ~100 g per 100 g are rejected');
  perform t.ok(t.throws($q$ insert into trophe.foods (name, kcal) values ('', 100) $q$), 'empty food name rejected');
  perform t.ok(t.throws($q$ insert into trophe.foods (name, kcal) values ('x', 2000) $q$), 'kcal per 100 g above 950 rejected');
  perform t.ok(t.throws($q$ insert into trophe.foods (name, kcal, barcode) values ('x', 10, 'abc') $q$), 'non-numeric barcode rejected');
  insert into trophe.food_servings (food_id, label, grams) values (f, ' 1 roti ', 40);
  perform t.ok((select label from trophe.food_servings where food_id = f) = '1 roti', 'serving label trimmed');
  perform t.ok(t.throws(format($q$ insert into trophe.food_servings (food_id, label, grams) values (%L, 'big', 0) $q$, f)), 'zero-gram serving rejected');
  insert into t.kv values ('chapati', f);
  perform t.logout();
end $$;

-- =============================================================== 6. diary ==
do $$
declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; f uuid := (select v::uuid from t.kv where k = 'chapati'); e uuid; q uuid;
begin
  perform t.login(a);
  insert into trophe.diary_entries (day, meal, food_id, grams, serving_label, serving_qty, kcal)
    values ('2026-10-20', 'lunch', f, 80, '1 roti', 2, 99999) returning id into e;
  perform t.ok((select kcal from trophe.diary_entries where id = e) = 237.6, 'kcal copied from the food for 80 g (client value ignored)');
  perform t.ok((select concat_ws('|', name, protein_g, carbs_g, fat_g, fiber_g) from trophe.diary_entries where id = e) = 'Chapati|8.8|36.8|6.0|7.2', 'name and macros copied and scaled');

  -- editing the food never rewrites history
  update trophe.foods set kcal = 500, name = 'Chapati (ghee)' where id = f;
  perform t.ok((select concat_ws('|', name, kcal) from trophe.diary_entries where id = e) = 'Chapati|237.6', 'editing the food leaves the logged entry unchanged');
  -- changing grams rescales the entry's own copy (not the edited food)
  update trophe.diary_entries set grams = 40, serving_qty = 1 where id = e;
  perform t.ok((select kcal from trophe.diary_entries where id = e) = 118.8, 'halving grams halves the entry''s own kcal');
  update trophe.foods set kcal = 297, name = 'Chapati' where id = f;

  perform t.ok(t.throws(format($q$ insert into trophe.diary_entries (day, meal, food_id) values ('2026-10-20', 'lunch', %L) $q$, f)), 'a food entry needs grams');
  perform t.ok(t.throws($q$ insert into trophe.diary_entries (day, meal, kcal) values ('2026-10-20', 'Lunch Time!', 10) $q$), 'meal must be a short slug');

  insert into trophe.diary_entries (day, meal, kcal, protein_g) values ('2026-10-20', 'snacks', 150, 3) returning id into q;
  perform t.ok((select concat_ws('|', name, kcal) from trophe.diary_entries where id = q) = 'Quick add|150.0', 'quick add keeps typed calories, default name');

  -- deleting the food keeps the entry and its numbers
  insert into trophe.foods (name, kcal, protein_g) values ('Temp', 100, 10) returning id into f;
  insert into trophe.diary_entries (day, meal, food_id, grams) values ('2026-10-20', 'dinner', f, 200) returning id into e;
  delete from trophe.foods where id = f;
  perform t.ok((select food_id is null and concat_ws('|', name, kcal, protein_g) = 'Temp|200.0|20.0' from trophe.diary_entries where id = e), 'deleting a food keeps the entry, unlinks it');
  perform t.logout();
end $$;

-- ======================================================= 7. goals & summary ==
do $$
declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; s jsonb;
begin
  perform t.login(a);
  s := trophe.day_summary('2026-10-20');
  perform t.ok(s->'goal' = 'null'::jsonb, 'no goal yet → goal is null');
  perform t.ok((s->'totals'->>'kcal')::numeric = 468.8 and (s->'totals'->>'entries')::int = 3, 'day totals: ' || (s->'totals')::text);
  perform t.ok((s->'meals'->'lunch'->>'kcal')::numeric = 118.8 and (s->'meals'->'snacks'->>'kcal')::numeric = 150, 'per-meal totals');

  insert into trophe.goals (effective_from, kcal, protein_g, carbs_g, fat_g) values ('2026-10-01', 2000, 120, 230, 65);
  insert into trophe.goals (effective_from, kcal, protein_g, carbs_g, fat_g) values ('2026-10-21', 500, 100, 20, 10);
  perform t.ok((trophe.day_summary('2026-10-20')->'goal'->>'kcal')::int = 2000, 'a day is judged by the goal in force then');
  perform t.ok((trophe.day_summary('2026-10-25')->'goal'->>'kcal')::int = 500, 'later days use the newer goal');
  perform t.ok(t.throws($q$ insert into trophe.goals (effective_from, kcal, protein_g, carbs_g, fat_g) values ('2026-10-01', 1800, 1, 1, 1) $q$), 'one goal per start day');
  perform t.ok(t.throws($q$ insert into trophe.goals (effective_from, kcal, protein_g, carbs_g, fat_g) values ('2026-11-01', 100, 1, 1, 1) $q$), 'absurd kcal goal rejected');

  insert into trophe.diary_entries (day, meal, kcal) values ('2026-10-21', 'lunch', 500), ('2026-10-22', 'lunch', 800);
  perform t.ok((select string_agg(day || ':' || status, ' ' order by day) from trophe.range_summary('2026-09-30', '2026-10-23'))
               like '2026-09-30:empty %2026-10-20:under 2026-10-21:on 2026-10-22:over 2026-10-23:empty', 'range verdicts: none / under / on / over');
  perform t.ok((select count(*) from trophe.range_summary('2020-01-01', '2026-01-01')) = 401, 'range is capped at ~13 months');

  insert into trophe.weigh_ins (day, kg) values ('2026-10-20', 72.4);
  perform t.ok(t.throws($q$ insert into trophe.weigh_ins (day, kg) values ('2026-10-20', 70) $q$), 'one weigh-in per day');
  update trophe.settings set sex = 'male', birth_year = 1998, height_cm = 175, activity = 'light';
  perform t.ok(t.throws($q$ update trophe.settings set activity = 'couch' $q$), 'unknown activity level rejected');
  perform t.logout();
end $$;

-- ====================================== 8. recent / frequent / search / copy ==
do $$
declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; f uuid := (select v::uuid from t.kv where k = 'chapati'); r record; n int; tpl uuid;
begin
  perform t.login(a);
  insert into trophe.foods (name, brand, kcal, protein_g) values ('Toor dal', 'Home', 116, 7), ('Curd', null, 60, 3.1);
  insert into trophe.diary_entries (day, meal, food_id, grams, logged_at) select '2026-10-21', 'lunch', id, 150, now() - interval '1 minute' from trophe.foods where name = 'Toor dal';
  insert into trophe.diary_entries (day, meal, food_id, grams, serving_label, serving_qty) values ('2026-10-21', 'lunch', f, 120, '1 roti', 3);

  select * into r from trophe.recent_foods('lunch', 5) limit 1;
  perform t.ok(r.name = 'Chapati' and r.last_grams = 120 and r.last_serving_qty = 3, 'recent foods: newest first, with last amount: ' || concat_ws('|', r.name, r.last_grams, r.last_serving_qty, r.last_logged_at));
  perform t.ok((select count(*) from trophe.recent_foods('breakfast')) = 0, 'recent foods narrowed by meal');
  select * into r from trophe.frequent_foods(null, 5) limit 1;
  perform t.ok(r.name = 'Chapati' and r.uses = 2, 'frequent foods ranked by uses: ' || r.name || ' ' || r.uses);

  perform t.ok((select string_agg(name, ',') from trophe.search_foods('dal')) = 'Toor dal', 'search by a word');
  perform t.ok((select string_agg(name, ',') from trophe.search_foods('home TOOR')) = 'Toor dal', 'search across name + brand, any order and case');
  perform t.ok((select name from trophe.search_foods('') limit 1) = 'Chapati', 'empty search lists foods, most used first');
  perform t.ok((select count(*) from trophe.search_foods('%')) = 0, 'LIKE wildcards are matched literally');
  update trophe.foods set archived_at = now() where name = 'Curd';
  perform t.ok(not exists (select 1 from trophe.search_foods('curd')) and exists (select 1 from trophe.search_foods('curd', 30, true)), 'archived foods only in the archive');

  n := trophe.copy_entries('2026-10-21', '2026-10-24', 'lunch', 'dinner');
  perform t.ok(n = 3 and (select count(*) from trophe.diary_entries where day = '2026-10-24' and meal = 'dinner') = 3, 'copy a meal to another day and meal');
  perform t.ok((select sum(kcal) from trophe.diary_entries where day = '2026-10-24') = (select sum(kcal) from trophe.diary_entries where day = '2026-10-21' and meal = 'lunch'), 'copied totals match');

  tpl := trophe.save_meal_template(' Usual lunch ', '2026-10-21', 'lunch');
  perform t.ok((select name from trophe.meal_templates where id = tpl) = 'Usual lunch' and (select count(*) from trophe.meal_template_items where template_id = tpl) = 2, 'save a meal: food entries only (quick add skipped)');
  perform t.ok(t.throws($q$ select trophe.save_meal_template('empty', '2030-01-01', 'lunch') $q$), 'saving an empty meal is refused');
  n := trophe.log_meal_template(tpl, '2026-10-25', 'lunch');
  perform t.ok(n = 2 and (select count(*) from trophe.diary_entries where day = '2026-10-25') = 2, 'log a saved meal');
  insert into t.kv values ('tpl', tpl);
  perform t.logout();
end $$;

-- ============================================ 9. tenant isolation (Phase 1) ==
do $$
declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; f uuid := (select v::uuid from t.kv where k = 'chapati'); tpl uuid := (select v::uuid from t.kv where k = 'tpl');
begin
  perform t.login('bbbbbbbb-0000-0000-0000-000000000002');
  perform t.ok(t.n('select count(*) from trophe.foods') = 0 and t.n('select count(*) from trophe.diary_entries') = 0
               and t.n('select count(*) from trophe.goals') = 0 and t.n('select count(*) from trophe.meal_templates') = 0
               and t.n('select count(*) from trophe.food_servings') = 0 and t.n('select count(*) from trophe.weigh_ins') = 0, 'B sees none of A''s foods, diary, goals, meals, servings, weights');
  perform t.ok(t.throws(format($q$ insert into trophe.diary_entries (day, meal, food_id, grams) values ('2026-10-20', 'lunch', %L, 100) $q$, f)), 'B cannot log A''s food');
  perform t.ok(t.throws(format($q$ insert into trophe.food_servings (food_id, label, grams) values (%L, 'x', 10) $q$, f)), 'B cannot add a serving to A''s food');
  perform t.ok(trophe.log_meal_template(tpl, '2026-10-20', 'lunch') = 0, 'B cannot log A''s saved meal');
  perform t.ok(trophe.copy_entries('2026-10-21', '2026-10-30') = 0, 'B cannot copy A''s day');
  perform t.ok((trophe.day_summary('2026-10-20')->'totals'->>'entries')::int = 0 and trophe.day_summary('2026-10-20')->'goal' = 'null'::jsonb, 'B''s summary ignores A''s data');
  perform t.ok(not exists (select 1 from trophe.recent_foods()) and not exists (select 1 from trophe.search_foods('')), 'B''s suggestions and search are empty');
  update trophe.foods set kcal = 1 where id = f;
  delete from trophe.diary_entries;
  perform t.logout();
  perform t.ok((select kcal from trophe.foods where id = f) = 297 and (select count(*) from trophe.diary_entries where user_id = a) > 0, 'A''s rows survive B''s update and delete');

  perform t.anon();
  perform t.ok(t.throws($q$ select trophe.day_summary('2026-10-20') $q$), 'anon cannot call the read model');
  perform t.logout();
end $$;

-- ======================================================== 10. online foods ==
do $$
declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; id1 uuid; id2 uuid;
  parle jsonb := '{"source":"off","external_id":"8901719100956","name":" Parle G ","brand":"Parle-G","barcode":"8901719100956","kcal":454,"protein_g":7,"carbs_g":77.3,"fat_g":13,"sugar_g":25,"sodium_mg":0}';
begin
  perform t.login(a);
  id1 := trophe.save_external_food(parle, '[{"label":"1 biscuit","grams":5.5},{"label":"","grams":10},{"label":"bad","grams":0}]');
  perform t.ok((select concat_ws('|', name, brand, source, external_id, barcode, kcal) from trophe.foods where id = id1) = 'Parle G|Parle-G|off|8901719100956|8901719100956|454.0', 'online food saved as the user''s food');
  perform t.ok((select string_agg(label || '=' || grams, ',') from trophe.food_servings where food_id = id1) = '1 biscuit=5.5', 'valid servings kept, blank / zero ones dropped');

  update trophe.foods set name = 'Parle-G (my name)', archived_at = now() where id = id1;
  id2 := trophe.save_external_food(parle || '{"kcal": 1}', '[{"label":"pack","grams":100}]');
  perform t.ok(id1 = id2, 'saving the same online food again returns the existing copy');
  perform t.ok((select concat_ws('|', name, kcal, archived_at is null) from trophe.foods where id = id1) = 'Parle-G (my name)|454.0|t', 'the user''s edits are kept; an archived copy comes back');
  perform t.ok((select count(*) from trophe.food_servings where food_id = id1) = 1, 'servings are not duplicated on re-save');

  perform t.ok(t.throws($q$ select trophe.save_external_food('{"source":"custom","external_id":"x","name":"x","kcal":1}') $q$), 'only online sources');
  perform t.ok(t.throws($q$ select trophe.save_external_food('{"source":"usda","external_id":"1","name":"x","kcal":5000}') $q$), 'impossible values are still rejected by the table checks');
  perform t.logout();

  perform t.login('bbbbbbbb-0000-0000-0000-000000000002');
  id2 := trophe.save_external_food(parle);
  perform t.ok(id2 <> id1 and (select count(*) from trophe.foods) = 1, 'each user gets their own copy');
  perform t.logout();
end $$;

-- ===================================================== 11. quick-add foods ==
do $$
declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; f uuid; g uuid; j jsonb;
begin
  perform t.login(a);
  insert into trophe.foods (name, kcal) values ('Quick roti', 300) returning id into f;
  insert into trophe.foods (name, kcal, archived_at) values ('Quick gone', 100, now()) returning id into g;
  insert into trophe.food_servings (food_id, label, grams, position) values (f, '1 roti', 40, 0), (f, '1 big roti', 60, 1);
  insert into trophe.diary_entries (day, meal, food_id, grams, serving_label, serving_qty, logged_at) values
    ('2026-10-01', 'lunch', f, 40, '1 roti', 1, now() - interval '1 day'),
    ('2026-10-02', 'lunch', f, 120, '1 big roti', 2, now());
  j := (select e from jsonb_array_elements(trophe.quick_log_foods()) e where e->>'id' = f::text);
  perform t.ok((j->>'uses')::int = 2 and j->'last' = '{"grams": 120.0, "serving_label": "1 big roti", "serving_qty": 2.00}'::jsonb, 'quick_log_foods: uses and the last amount');
  perform t.ok(jsonb_array_length(j->'servings') = 2 and j->'servings'->0->>'label' = '1 roti', 'quick_log_foods: servings in order');
  perform t.ok(not exists (select 1 from jsonb_array_elements(trophe.quick_log_foods()) with ordinality x(e, i)
                           join jsonb_array_elements(trophe.quick_log_foods()) with ordinality y(e, i) on y.i = x.i + 1
                           where (y.e->>'uses')::int > (x.e->>'uses')::int), 'quick_log_foods: most logged first');
  perform t.ok(not exists (select 1 from jsonb_array_elements(trophe.quick_log_foods()) e where e->>'id' = g::text), 'quick_log_foods: archived foods are left out');
  perform t.logout();

  perform t.login('bbbbbbbb-0000-0000-0000-000000000002');
  perform t.ok(not exists (select 1 from jsonb_array_elements(trophe.quick_log_foods()) e where e->>'id' = f::text), 'quick_log_foods: only your own foods');
  perform t.logout();
end $$;

-- =========================================================== 12. recipes ==
do $$
declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; rice uuid; dal uuid; ghee uuid; r uuid; r2 uuid; e uuid;
begin
  perform t.login(a);
  insert into trophe.foods (name, kcal, protein_g, carbs_g, fat_g, fiber_g) values ('R rice raw', 360, 7, 79, 0.6, 1.3) returning id into rice;
  insert into trophe.foods (name, kcal, protein_g, carbs_g, fat_g, fiber_g) values ('R toor dal raw', 340, 22, 60, 1.5, 15) returning id into dal;
  insert into trophe.foods (name, kcal, fat_g) values ('R ghee', 900, 100) returning id into ghee;

  -- 200 g rice + 100 g dal + 20 g ghee = 1240 kcal raw; cooked weight 1000 g, 4 portions
  r := trophe.save_recipe(null, ' Khichdi ', jsonb_build_array(
         jsonb_build_object('food_id', rice, 'grams', 200),
         jsonb_build_object('food_id', dal, 'grams', 100, 'serving_label', '1 cup', 'serving_qty', 0.5),
         jsonb_build_object('food_id', ghee, 'grams', 20)), 1000, 4);
  perform t.ok((select concat_ws('|', name, source, kcal, protein_g, carbs_g, fat_g, fiber_g) from trophe.foods where id = r) = 'Khichdi|recipe|124.0|3.6|21.8|2.3|1.8',
               'a recipe''s numbers per 100 g come from its ingredients and the cooked weight');
  perform t.ok((select string_agg(label || '=' || grams, ',') from trophe.food_servings where food_id = r) = '1 portion=250.0', '"1 portion" = cooked weight / portions');
  perform t.ok((select string_agg(serving_label || ':' || position, ',' order by position) from trophe.recipe_items where recipe_id = r) = '1 cup:1', 'items keep their order and how they were entered');

  insert into trophe.diary_entries (day, meal, food_id, grams, serving_label, serving_qty) values ('2026-10-05', 'lunch', r, 250, '1 portion', 1) returning id into e;
  perform t.ok((select kcal from trophe.diary_entries where id = e) = 310.0, 'a recipe is logged like any food');

  -- editing an ingredient updates the recipe (but never the diary)
  update trophe.foods set kcal = 400 where id = rice;
  perform t.ok((select kcal from trophe.foods where id = r) = 132.0, 'an ingredient edit updates its recipes');
  perform t.ok((select kcal from trophe.diary_entries where id = e) = 310.0, '... while logged entries keep their numbers');

  -- re-saving: no cooked weight = the raw total; no portions = no portion serving
  r2 := trophe.save_recipe(r, 'Khichdi', jsonb_build_array(jsonb_build_object('food_id', rice, 'grams', 100)), null, null);
  perform t.ok(r2 = r and (select kcal from trophe.foods where id = r) = 400 and not exists (select 1 from trophe.food_servings where food_id = r)
               and (select count(*) from trophe.recipe_items where recipe_id = r) = 1, 're-saving replaces the items; raw total when no cooked weight');

  perform t.ok(t.throws(format($q$ select trophe.save_recipe(null, 'Bad', '[{"food_id":"%s","grams":100}]', 10) $q$, ghee)), 'a cooked weight too low for the ingredients is refused');
  perform t.ok(t.throws($q$ select trophe.save_recipe(null, 'Empty', '[]') $q$), 'a recipe needs an ingredient');
  perform t.ok(t.throws($q$ select trophe.save_recipe(null, '  ', '[]') $q$), 'a recipe needs a name');
  perform t.ok(t.throws(format($q$ select trophe.save_recipe(null, 'Nested', '[{"food_id":"%s","grams":100}]') $q$, r)), 'a recipe can''t be an ingredient');
  perform t.ok(t.throws(format($q$ insert into trophe.recipe_items (recipe_id, food_id, grams) values (%L, %L, 10) $q$, rice, dal)), 'items only go into recipes');
  perform t.ok(t.throws(format($q$ select trophe.save_recipe(%L, 'Hijack', '[{"food_id":"%s","grams":100}]') $q$, rice, rice)), 'save_recipe only edits recipes');

  -- an edit that would make the recipe impossible still goes through; the recipe keeps its numbers
  perform trophe.save_recipe(r, 'Khichdi', jsonb_build_array(jsonb_build_object('food_id', rice, 'grams', 100)), 90, null);
  update trophe.foods set kcal = 900 where id = rice;
  perform t.ok((select kcal from trophe.foods where id = rice) = 900 and (select kcal from trophe.foods where id = r) = 444.4, 'an impossible recompute leaves the recipe as it was');
  perform t.logout();

  perform t.login('bbbbbbbb-0000-0000-0000-000000000002');
  perform t.ok(t.throws(format($q$ select trophe.save_recipe(null, 'Mine now', '[{"food_id":"%s","grams":100}]') $q$, rice)), 'B can''t use A''s food as an ingredient');
  perform t.ok(t.throws(format($q$ select trophe.save_recipe(%L, 'Mine now', '[]') $q$, r)), 'B can''t edit A''s recipe');
  perform t.ok(t.n('select count(*) from trophe.recipe_items') = 0, 'B sees none of A''s recipe items');
  perform t.logout();
end $$;

-- ================================================ 4. coexistence with others ==
do $$
begin
  perform t.ok(not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'auth' and not tg.tgisinternal), 'Trophe adds no trigger on auth.users');
  perform t.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'public' and c.relkind in ('r', 'v', 'f')), 'Trophe creates nothing in public');
  perform t.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'trophe' and c.relkind = 'r' and not c.relrowsecurity), 'every trophe table has RLS on');
  perform t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'trophe' and has_function_privilege('anon', p.oid, 'EXECUTE')),
               'no trophe function is executable by anon: ' || coalesce((select string_agg(p.proname, ', ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                                                where n.nspname = 'trophe' and has_function_privilege('anon', p.oid, 'EXECUTE')), 'none'));
end $$;

rollback;
\echo ALL TESTS PASSED
