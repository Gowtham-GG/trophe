import { supabase } from '@/lib/supabase'
import type { Fast, FastingStats } from '@/types/db'
import { toError } from './errors'

const COLUMNS = 'id,started_at,ended_at,target_hours'

/** The running fast, if any (there is at most one). */
export async function currentFast(): Promise<Fast | null> {
  const { data, error } = await supabase.from('fasts').select(COLUMNS).is('ended_at', null).maybeSingle()
  if (error) throw toError(error)
  return data as Fast | null
}

export async function listFasts(limit = 20): Promise<Fast[]> {
  const { data, error } = await supabase.from('fasts').select(COLUMNS).not('ended_at', 'is', null).order('started_at', { ascending: false }).limit(limit)
  if (error) throw toError(error)
  return (data as Fast[]) ?? []
}

export async function startFast(startedAt: Date, targetHours: number): Promise<Fast> {
  const { data, error } = await supabase.from('fasts').insert({ started_at: startedAt.toISOString(), target_hours: targetHours }).select(COLUMNS).single()
  if (error) throw toError(error)
  return data as Fast
}

export async function updateFast(id: string, patch: Partial<Pick<Fast, 'started_at' | 'ended_at' | 'target_hours'>>): Promise<Fast> {
  const { data, error } = await supabase.from('fasts').update(patch).eq('id', id).select(COLUMNS).single()
  if (error) throw toError(error)
  return data as Fast
}

export async function deleteFast(id: string): Promise<void> {
  const { error } = await supabase.from('fasts').delete().eq('id', id)
  if (error) throw toError(error)
}

export async function fastingStats(): Promise<FastingStats> {
  const { data, error } = await supabase.rpc('fasting_stats', {})
  if (error) throw toError(error)
  return data as FastingStats
}

/** When you last logged food: a natural start for a fast ("since my last meal"). */
export async function lastLoggedAt(): Promise<string | null> {
  const { data, error } = await supabase.from('diary_entries').select('logged_at').order('logged_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw toError(error)
  return (data as { logged_at: string } | null)?.logged_at ?? null
}
