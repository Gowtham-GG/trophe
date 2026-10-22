-- =============================================================================
-- Test fixture only (integration tests and the local browser stack; never the real project):
-- the parts of the sibling apps Trophe reads or writes, so the links can be tested end to end.
--   mneme: settings (timezone), habits, habit_logs, habit_due(), bump_habit() — copied from
--          Mneme's migration 19 (bump_habit verbatim)
--   public (Argus): categories, expenses — the columns Trophe reads
-- =============================================================================
begin;
create schema if not exists mneme;
grant usage on schema mneme to authenticated;

create table if not exists mneme.settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  timezone text not null default 'UTC'
);
create table if not exists mneme.habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  target      integer not null default 1 check (target between 1 and 1000),
  unit        text,
  days        smallint not null default 127,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint habits_id_user_key unique (id, user_id)
);
create table if not exists mneme.habit_logs (
  habit_id uuid not null,
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day      date not null,
  value    integer not null check (value between 1 and 100000),
  primary key (habit_id, day),
  foreign key (habit_id, user_id) references mneme.habits (id, user_id) on delete cascade
);
do $$
declare t text;
begin
  foreach t in array array['settings', 'habits', 'habit_logs'] loop
    execute format('alter table mneme.%I enable row level security', t);
    execute format('drop policy if exists %I on mneme.%I', t || '_owner', t);
    execute format('create policy %I on mneme.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_owner', t);
  end loop;
end $$;
grant select, insert, update, delete on all tables in schema mneme to authenticated;

create or replace function mneme.habit_due(p_days smallint, p_day date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_days & (1 << (extract(isodow from p_day)::int - 1))) <> 0
$$;

create or replace function mneme.bump_habit(p_habit uuid, p_day date, p_delta integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_tz    text;
  v_value integer;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select s.timezone into v_tz from mneme.settings s where s.user_id = v_uid;
  if p_day is null or p_day > (now() at time zone coalesce(v_tz, 'UTC'))::date + 1 then
    raise exception 'cannot log a future day' using errcode = '22023';
  end if;
  if not exists (select 1 from mneme.habits h where h.id = p_habit and h.user_id = v_uid) then
    raise exception 'habit not found' using errcode = 'P0002';
  end if;

  p_delta := coalesce(p_delta, 0);
  if p_delta > 0 then
    insert into mneme.habit_logs as l (habit_id, user_id, day, value)
    values (p_habit, v_uid, p_day, p_delta)
    on conflict (habit_id, day) do update set value = l.value + excluded.value
    returning l.value into v_value;
    return v_value;
  end if;
  if p_delta < 0 then
    -- going to (or below) zero means "nothing logged that day": drop the row
    delete from mneme.habit_logs l
    where l.habit_id = p_habit and l.day = p_day and l.value + p_delta <= 0;
    update mneme.habit_logs l set value = l.value + p_delta
    where l.habit_id = p_habit and l.day = p_day
    returning l.value into v_value;
    return coalesce(v_value, 0);
  end if;
  select l.value into v_value from mneme.habit_logs l where l.habit_id = p_habit and l.day = p_day;
  return coalesce(v_value, 0);
end
$$;

grant execute on all functions in schema mneme to authenticated;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('expense', 'income')),
  sort_order integer default 0,
  archived boolean default false
);
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  amount numeric(12,2) not null check (amount >= 0),
  expense_date date not null
);
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
drop policy if exists categories_owner on public.categories;
create policy categories_owner on public.categories for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists expenses_owner on public.expenses;
create policy expenses_owner on public.expenses for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.categories, public.expenses to authenticated;
commit;
