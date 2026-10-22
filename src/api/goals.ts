import { supabase } from '@/lib/supabase'
import type { Goal, MaintenanceEstimate } from '@/types/db'
import { toError } from './errors'

const GOAL_COLUMNS = 'id,effective_from,kcal,protein_g,carbs_g,fat_g,fiber_g,pace_kg_week'

/** The goal in force on `day` (null before the first one). */
export async function goalFor(day: string): Promise<Goal | null> {
  const { data, error } = await supabase.from('goals').select(GOAL_COLUMNS).lte('effective_from', day).order('effective_from', { ascending: false }).limit(1).maybeSingle()
  if (error) throw toError(error)
  return data as Goal | null
}

/** Save a goal starting on `effective_from`; saving twice on one day replaces it. Past days keep their old goal. */
export async function saveGoal(g: Goal): Promise<Goal> {
  const { id: _id, ...row } = g
  const { data, error } = await supabase.from('goals').upsert(row, { onConflict: 'user_id,effective_from' }).select(GOAL_COLUMNS).single()
  if (error) throw toError(error)
  return data as Goal
}

/** Maintenance measured from the 4 weeks before `today` (intake against the weight trend), and the suggested target. */
export async function maintenanceEstimate(today: string): Promise<MaintenanceEstimate> {
  const { data, error } = await supabase.rpc('maintenance_estimate', { p_today: today })
  if (error) throw toError(error)
  return data as MaintenanceEstimate
}

/** Record today's weight (one per day; saving again replaces it). */
export async function saveWeighIn(day: string, kg: number): Promise<void> {
  const { error } = await supabase.from('weigh_ins').upsert({ day, kg }, { onConflict: 'user_id,day' })
  if (error) throw toError(error)
}

export async function latestWeighIn(): Promise<{ day: string; kg: number } | null> {
  const { data, error } = await supabase.from('weigh_ins').select('day,kg').order('day', { ascending: false }).limit(1).maybeSingle()
  if (error) throw toError(error)
  return data as { day: string; kg: number } | null
}
