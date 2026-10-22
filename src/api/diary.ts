import { supabase } from '@/lib/supabase'
import type { DaySummary, DiaryEntry, MicrosSummary, RangeDay } from '@/types/db'
import { toError } from './errors'

const ENTRY_COLUMNS = 'id,day,meal,food_id,name,brand,grams,serving_label,serving_qty,kcal,protein_g,carbs_g,fat_g,fiber_g,sugar_g,sodium_mg,micros,position,logged_at'

export async function fetchDayEntries(day: string): Promise<DiaryEntry[]> {
  const { data, error } = await supabase.from('diary_entries').select(ENTRY_COLUMNS).eq('day', day).order('position').order('logged_at')
  if (error) throw toError(error)
  return (data as DiaryEntry[]) ?? []
}

export async function daySummary(day: string): Promise<DaySummary> {
  const { data, error } = await supabase.rpc('day_summary', { p_day: day })
  if (error) throw toError(error)
  return data as DaySummary
}

/** One row per day in [from, to] with totals and the under / on / over verdict. */
/** Micronutrients (and sugar, sodium) per logged day on average over [from, to]; one day: from = to. */
export async function microsSummary(from: string, to: string): Promise<MicrosSummary> {
  const { data, error } = await supabase.rpc('micros_summary', { p_from: from, p_to: to })
  if (error) throw toError(error)
  return data as MicrosSummary
}

export async function rangeSummary(from: string, to: string): Promise<RangeDay[]> {
  const { data, error } = await supabase.rpc('range_summary', { p_from: from, p_to: to })
  if (error) throw toError(error)
  return (data as RangeDay[]) ?? []
}

/** Log a food: the database copies its nutrients for `grams` (client ids make retries safe). */
export async function logFood(e: { day: string; meal: string; food_id: string; grams: number; serving_label: string | null; serving_qty: number | null }): Promise<DiaryEntry> {
  const { data, error } = await supabase.from('diary_entries').insert({ id: crypto.randomUUID(), ...e }).select(ENTRY_COLUMNS).single()
  if (error) throw toError(error)
  return data as DiaryEntry
}

export type FoodEntry = Parameters<typeof logFood>[0]

/** Several foods in one insert (quick add by typing): all are logged, or none. */
export async function logFoods(entries: FoodEntry[]): Promise<DiaryEntry[]> {
  if (!entries.length) return []
  const { data, error } = await supabase.from('diary_entries').insert(entries.map((e, i) => ({ id: crypto.randomUUID(), position: i, ...e }))).select(ENTRY_COLUMNS)
  if (error) throw toError(error)
  return (data as DiaryEntry[]) ?? []
}

export interface QuickEntry { day: string; meal: string; name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number }

/** A quick add: calories (and optional macros) typed directly, no food. */
export async function logQuick(e: QuickEntry): Promise<DiaryEntry> {
  const { data, error } = await supabase.from('diary_entries').insert({ id: crypto.randomUUID(), ...e }).select(ENTRY_COLUMNS).single()
  if (error) throw toError(error)
  return data as DiaryEntry
}

export type EntryPatch = Partial<Pick<DiaryEntry, 'meal' | 'day' | 'grams' | 'serving_label' | 'serving_qty' | 'name' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'>>

/** Changing grams rescales the entry's own numbers in the database. */
export async function updateEntry(id: string, patch: EntryPatch): Promise<DiaryEntry> {
  const { data, error } = await supabase.from('diary_entries').update(patch).eq('id', id).select(ENTRY_COLUMNS).single()
  if (error) throw toError(error)
  return data as DiaryEntry
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('diary_entries').delete().eq('id', id)
  if (error) throw toError(error)
}

/** Put a deleted entry back exactly as it was (Undo). */
export async function restoreEntry(e: DiaryEntry): Promise<void> {
  const { error } = await supabase.from('diary_entries').insert(e)
  if (error) throw toError(error)
}

/** Copy a day, or one meal of it, to another day / meal. Returns how many entries were added. */
export async function copyEntries(fromDay: string, toDay: string, meal: string | null = null, toMeal: string | null = null): Promise<number> {
  const { data, error } = await supabase.rpc('copy_entries', { p_from_day: fromDay, p_to_day: toDay, p_meal: meal, p_to_meal: toMeal })
  if (error) throw toError(error)
  return Number(data ?? 0)
}
