-- =============================================================================
-- Trophe 14 — insights
-- Plain rules over your own last days (no AI): which ones apply is decided here,
-- so every client agrees; the app words them. Each insight is
-- {kind, tone: warn | note | good, data: {…numbers…}}, warnings first.
-- The window is the 7 days before today (today isn't finished); patterns that
-- need more days look at 28.
-- =============================================================================
begin;

create or replace function trophe.insights(p_today date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_out jsonb := '[]'::jsonb;
  g record;
  w record;
  r record;
  st jsonb;
  ws jsonb;
  water_goal integer;
begin
  select gf.* into g from trophe.goal_for(p_today - 1) gf;

  -- the last 7 days, logged ones only
  select count(*) as logged,
         round(avg(d.kcal)) as kcal, round(avg(d.protein_g)) as protein_g,
         count(*) filter (where g.protein_g is not null and d.protein_g < g.protein_g * 0.9) as protein_low_days,
         count(*) filter (where d.status = 'under') as under_days,
         count(*) filter (where d.status = 'over') as over_days
    into w
    from trophe.range_summary(p_today - 7, p_today - 1) d where d.entries > 0;

  if g.protein_g is not null and w.protein_low_days >= 4 then
    v_out := v_out || jsonb_build_object('kind', 'protein_low', 'tone', 'warn',
      'data', jsonb_build_object('days', w.protein_low_days, 'of', w.logged, 'avg', w.protein_g, 'goal', g.protein_g));
  end if;

  if g.kcal is not null and w.under_days >= 4 and w.kcal < g.kcal * 0.8 then
    v_out := v_out || jsonb_build_object('kind', 'under_eating', 'tone', 'warn',
      'data', jsonb_build_object('days', w.under_days, 'of', w.logged, 'avg', w.kcal, 'goal', g.kcal));
  end if;

  -- the weight trend against the goal's pace (kg / week)
  ws := trophe.weight_summary();
  if g.pace_kg_week is not null and (ws->>'week_rate') is not null then
    if g.pace_kg_week < 0 and (ws->>'week_rate')::numeric < g.pace_kg_week * 1.6 and (ws->>'week_rate')::numeric < -0.6 then
      v_out := v_out || jsonb_build_object('kind', 'losing_fast', 'tone', 'warn', 'data', jsonb_build_object('rate', ws->'week_rate', 'pace', g.pace_kg_week));
    elsif g.pace_kg_week < 0 and (ws->>'week_rate')::numeric > 0.1 then
      v_out := v_out || jsonb_build_object('kind', 'trend_rising', 'tone', 'note', 'data', jsonb_build_object('rate', ws->'week_rate', 'pace', g.pace_kg_week));
    elsif g.pace_kg_week > 0 and (ws->>'week_rate')::numeric < -0.1 then
      v_out := v_out || jsonb_build_object('kind', 'trend_falling', 'tone', 'note', 'data', jsonb_build_object('rate', ws->'week_rate', 'pace', g.pace_kg_week));
    end if;
  end if;

  -- weekends against weekdays over 4 weeks
  st := trophe.nutrition_stats(p_today - 28, p_today - 1);
  if (st->'weekend'->>'days')::int >= 3 and (st->'weekday'->>'days')::int >= 8
     and (st->'weekend'->>'kcal')::numeric - (st->'weekday'->>'kcal')::numeric >= 300 then
    v_out := v_out || jsonb_build_object('kind', 'weekend_overshoot', 'tone', 'note',
      'data', jsonb_build_object('weekend', st->'weekend'->'kcal', 'weekday', st->'weekday'->'kcal'));
  end if;

  -- fibre and water, when there's enough logged to say
  if g.fiber_g is not null and w.logged >= 4 then
    select round(avg(x.fiber)) as avg into r from (
      select sum(e.fiber_g) as fiber from trophe.diary_entries e
      where e.user_id = uid and e.day between p_today - 7 and p_today - 1 group by e.day) x;
    if r.avg is not null and r.avg < g.fiber_g * 0.7 then
      v_out := v_out || jsonb_build_object('kind', 'fibre_low', 'tone', 'note', 'data', jsonb_build_object('avg', r.avg, 'goal', g.fiber_g));
    end if;
  end if;

  select s.water_goal_ml into water_goal from trophe.settings s where s.user_id = uid;
  select count(*) as days, round(avg(wr.ml)) as avg into r from trophe.water_range(p_today - 7, p_today - 1) wr where wr.ml > 0;
  if r.days >= 3 and r.avg < coalesce(water_goal, 2500) * 0.7 then
    v_out := v_out || jsonb_build_object('kind', 'water_low', 'tone', 'note', 'data', jsonb_build_object('avg', r.avg, 'goal', coalesce(water_goal, 2500)));
  end if;

  -- a gap: you usually log, but not yesterday
  select count(*) filter (where d.entries > 0) as logged into r from trophe.range_summary(p_today - 14, p_today - 2) d;
  if r.logged >= 7 and not exists (select 1 from trophe.diary_entries e where e.user_id = uid and e.day = p_today - 1) then
    v_out := v_out || jsonb_build_object('kind', 'missed_yesterday', 'tone', 'note', 'data', jsonb_build_object('day', p_today - 1));
  end if;

  -- the good news
  st := trophe.streaks(p_today);
  if (st->>'target_current')::int >= 3 then
    v_out := v_out || jsonb_build_object('kind', 'target_streak', 'tone', 'good', 'data', jsonb_build_object('days', st->'target_current', 'best', st->'target_best'));
  elsif g.kcal is not null and w.logged >= 5 and abs(w.kcal - g.kcal) <= g.kcal * 0.05 and w.over_days <= 1 then
    v_out := v_out || jsonb_build_object('kind', 'steady_week', 'tone', 'good', 'data', jsonb_build_object('avg', w.kcal, 'goal', g.kcal));
  end if;

  return v_out;
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
