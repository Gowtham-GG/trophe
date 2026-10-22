import { supabase } from '@/lib/supabase'
import { toCsv } from '@/lib/csv'
import { describeAmount } from '@/lib/nutrition'
import type { DiaryEntry } from '@/types/db'
import { toError } from './errors'

export interface Backup { app: 'trophe'; version: number; exported_at: string; tables: Record<string, Record<string, unknown>[]> }

/** Everything of yours as one document (see export_backup, migration 19). */
export async function exportBackup(): Promise<Backup> {
  const { data, error } = await supabase.rpc('export_backup', {})
  if (error) throw toError(error)
  return data as Backup
}

/** Add back what a backup has and this account lacks; returns how many rows went into each table. */
export async function restoreBackup(doc: unknown): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('restore_backup', { p_doc: doc })
  if (error) throw toError(error)
  return (data as Record<string, number>) ?? {}
}

/** The diary as CSV: one row per entry, oldest first. */
export function diaryCsv(b: Backup): string {
  const rows = [...(b.tables.diary_entries as unknown as DiaryEntry[])].sort((x, y) => x.day.localeCompare(y.day) || x.logged_at.localeCompare(y.logged_at))
  return toCsv(
    ['day', 'meal', 'food', 'brand', 'amount', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg'],
    rows.map((e) => [e.day, e.meal, e.name, e.brand, describeAmount(e) || 'quick add', e.grams, e.kcal, e.protein_g, e.carbs_g, e.fat_g, e.fiber_g, e.sugar_g, e.sodium_mg]),
  )
}

/** Weight and measurements as CSV, one row per day that has either. */
export function bodyCsv(b: Backup): string {
  const days = new Map<string, Record<string, unknown>>()
  for (const w of b.tables.weigh_ins ?? []) days.set(String(w.day), { ...days.get(String(w.day)), kg: w.kg })
  for (const m of b.tables.measurements ?? []) days.set(String(m.day), { ...days.get(String(m.day)), ...m })
  const keys = ['kg', 'body_fat_pct', 'waist_cm', 'hips_cm', 'chest_cm', 'neck_cm', 'arm_cm', 'thigh_cm']
  return toCsv(['day', ...keys], [...days].sort(([a], [b2]) => a.localeCompare(b2)).map(([day, v]) => [day, ...keys.map((k) => (v[k] as number | null | undefined) ?? null)]))
}

/** Save text as a file in the browser. */
export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
