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
