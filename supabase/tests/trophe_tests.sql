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

-- ================================================ 4. coexistence with others ==
do $$
begin
  perform t.ok(not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'auth' and not tg.tgisinternal), 'Trophe adds no trigger on auth.users');
  perform t.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'public' and c.relkind in ('r', 'v', 'f')), 'Trophe creates nothing in public');
  perform t.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'trophe' and c.relkind = 'r' and not c.relrowsecurity), 'every trophe table has RLS on');
end $$;

rollback;
\echo ALL TESTS PASSED
