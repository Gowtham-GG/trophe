import { supabase } from '@/lib/supabase'
import { MEASURES, type MeasureKey, type Measurement, type WaterEntry, type WeightPoint, type WeightSummary } from '@/types/db'
import { toError } from './errors'

// ------------------------------------------------------------------ weight --

/** Weigh-ins in [from, to] with the smoothed trend (worked out in the database, see migration 11). */
export async function weightTrend(from: string, to: string): Promise<WeightPoint[]> {
  const { data, error } = await supabase.rpc('weight_trend', { p_from: from, p_to: to })
  if (error) throw toError(error)
  return (data as WeightPoint[]) ?? []
}

export async function weightSummary(): Promise<WeightSummary> {
  const { data, error } = await supabase.rpc('weight_summary', {})
  if (error) throw toError(error)
  return data as WeightSummary
}

export async function deleteWeighIn(day: string): Promise<void> {
  const { error } = await supabase.from('weigh_ins').delete().eq('day', day)
  if (error) throw toError(error)
}

// ------------------------------------------------------------ measurements --

const MEASURE_COLUMNS = `day,${MEASURES.join(',')}`

/** Every day with measurements, newest first. */
export async function fetchMeasurements(limit = 200): Promise<Measurement[]> {
  const { data, error } = await supabase.from('measurements').select(MEASURE_COLUMNS).order('day', { ascending: false }).limit(limit)
  if (error) throw toError(error)
  return (data as unknown as Measurement[]) ?? []
}

/** Save the values given for a day; ones left out keep what that day already had. */
export async function saveMeasurement(day: string, values: Partial<Record<MeasureKey, number | null>>): Promise<void> {
  const { error } = await supabase.from('measurements').upsert({ day, ...values }, { onConflict: 'user_id,day' })
  if (error) throw toError(error)
}

export async function deleteMeasurement(day: string): Promise<void> {
  const { error } = await supabase.from('measurements').delete().eq('day', day)
  if (error) throw toError(error)
}

// ------------------------------------------------------------------- water --

export async function fetchWater(day: string): Promise<WaterEntry[]> {
  const { data, error } = await supabase.from('water_entries').select('id,day,ml,logged_at').eq('day', day).order('logged_at')
  if (error) throw toError(error)
  return (data as WaterEntry[]) ?? []
}

export async function addWater(day: string, ml: number): Promise<WaterEntry> {
  const { data, error } = await supabase.from('water_entries').insert({ id: crypto.randomUUID(), day, ml }).select('id,day,ml,logged_at').single()
  if (error) throw toError(error)
  return data as WaterEntry
}

export async function deleteWater(id: string): Promise<void> {
  const { error } = await supabase.from('water_entries').delete().eq('id', id)
  if (error) throw toError(error)
}

/** ml per day in [from, to], days without water as 0. */
export async function waterRange(from: string, to: string): Promise<{ day: string; ml: number }[]> {
  const { data, error } = await supabase.rpc('water_range', { p_from: from, p_to: to })
  if (error) throw toError(error)
  return (data as { day: string; ml: number }[]) ?? []
}
