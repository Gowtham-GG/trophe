-- =============================================================================
-- Trophe 13 — adaptive calorie target
-- Formulas guess maintenance from age, height and activity; your own data can
-- measure it. Over the last 4 weeks: what you ate on average, minus the energy
-- your weight trend gained (or plus what it lost, ~7700 kcal per kg), per day.
-- The goal's chosen pace (kg / week) then turns that into a suggested target.
-- Nothing changes until the user accepts the suggestion.
-- =============================================================================
begin;

-- the pace the goal was set for (negative = lose); null for goals typed in by hand
alter table trophe.goals add column if not exists pace_kg_week numeric(4,2) check (pace_kg_week is null or pace_kg_week between -2 and 2);

-- p_today: the user's today (its own intake isn't finished, so the window ends yesterday)
create or replace function trophe.maintenance_estimate(p_today date, p_days integer default 28)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 28), 14), 90);
  v_from date := p_today - v_days;
  v_to date := p_today - 1;
  v_logged integer;
  v_avg numeric;
  v_first record;
  v_last record;
  v_weighs integer;
  v_span integer;
  v_change numeric;
  v_estimate numeric;
  v_confidence text;
  v_needs jsonb := '[]'::jsonb;
  v_goal record;
  v_sex text;
  v_suggested numeric;
begin
  select count(*) filter (where entries > 0), avg(kcal) filter (where entries > 0)
    into v_logged, v_avg
    from trophe.range_summary(v_from, v_to);

  select count(*) into v_weighs from trophe.weight_trend(v_from, v_to);
  select * into v_first from trophe.weight_trend(v_from, v_to) order by day limit 1;
  select * into v_last from trophe.weight_trend(v_from, v_to) order by day desc limit 1;
  v_span := coalesce(v_last.day - v_first.day, 0);

  if v_logged < 14 then v_needs := v_needs || jsonb_build_object('kind', 'log', 'count', 14 - v_logged); end if;
  if v_weighs < 4 or v_span < 14 then v_needs := v_needs || jsonb_build_object('kind', 'weigh', 'count', greatest(4 - v_weighs, 0), 'span', v_span); end if;

  if jsonb_array_length(v_needs) = 0 then
    v_change := v_last.trend - v_first.trend;
    v_estimate := round((v_avg - v_change * 7700 / v_span) / 10) * 10;
    v_confidence := case
      -- numbers that can't be a person's maintenance mean something isn't being logged
      when v_estimate < 1000 or v_estimate > 6000 then 'low'
      when v_logged < v_days * 0.75 or v_span < 21 then 'medium'
      else 'high' end;
  end if;

  select g.kcal, g.pace_kg_week into v_goal from trophe.goals g
  where g.user_id = (select auth.uid()) and g.effective_from <= p_today order by g.effective_from desc limit 1;
  select s.sex into v_sex from trophe.settings s where s.user_id = (select auth.uid());
  if v_estimate is not null and v_goal.pace_kg_week is not null then
    v_suggested := greatest(round((v_estimate + v_goal.pace_kg_week * 7700 / 7) / 10) * 10, case when v_sex = 'male' then 1500 else 1200 end);
  end if;

  return jsonb_build_object(
    'from', v_from, 'to', v_to, 'days', v_days,
    'logged_days', v_logged, 'avg_kcal', round(v_avg),
    'weigh_ins', v_weighs,
    'trend_from', case when v_first.day is null then null else jsonb_build_object('day', v_first.day, 'trend', v_first.trend) end,
    'trend_to', case when v_last.day is null then null else jsonb_build_object('day', v_last.day, 'trend', v_last.trend) end,
    'change_kg', round(v_change, 2),
    'estimate_kcal', v_estimate,
    'confidence', coalesce(v_confidence, 'none'),
    'needs', v_needs,
    'goal_kcal', v_goal.kcal,
    'pace_kg_week', v_goal.pace_kg_week,
    'suggested_kcal', v_suggested
  );
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
