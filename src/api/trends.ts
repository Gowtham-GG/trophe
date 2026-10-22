import { supabase } from '@/lib/supabase'
import type { Insight, NutritionPeriod, NutritionStats, Streaks } from '@/types/db'
import { toError } from './errors'

/** Weekly (from Monday) or monthly averages in [from, to], over the days with something logged. */
export async function nutritionPeriods(from: string, to: string, period: 'week' | 'month'): Promise<NutritionPeriod[]> {
  const { data, error } = await supabase.rpc('nutrition_periods', { p_from: from, p_to: to, p_period: period })
  if (error) throw toError(error)
  return (data as NutritionPeriod[]) ?? []
}

export async function nutritionStats(from: string, to: string): Promise<NutritionStats> {
  const { data, error } = await supabase.rpc('nutrition_stats', { p_from: from, p_to: to })
  if (error) throw toError(error)
  return data as NutritionStats
}

/** Days in a row logged / on target, current (ending today or yesterday) and best, over the last 400 days. */
export async function streaks(today: string): Promise<Streaks> {
  const { data, error } = await supabase.rpc('streaks', { p_today: today })
  if (error) throw toError(error)
  return data as Streaks
}

/** The insight rules that apply to the 7 days before `today` (28 for weekend patterns), warnings first. */
export async function insights(today: string): Promise<Insight[]> {
  const { data, error } = await supabase.rpc('insights', { p_today: today })
  if (error) throw toError(error)
  return (data as Insight[]) ?? []
}
