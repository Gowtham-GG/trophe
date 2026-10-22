// Reading (and, for Mneme habits, ticking) the sibling apps' data. Same Supabase project and sign-in; each app's own
// RLS keeps it to the user's rows. Everything here is optional: an app that isn't set up just isn't offered.
import { supabase } from '@/lib/supabase'
import { toError } from './errors'

export interface MnemeHabit { id: string; name: string; target: number; unit: string | null }
export interface ArgusCategory { id: string; name: string }

/** Your active Mneme habits, or null when Mneme isn't reachable (schema not exposed, not set up). */
export async function mnemeHabits(): Promise<MnemeHabit[] | null> {
  const { data, error } = await supabase.schema('mneme').from('habits').select('id,name,target,unit').is('archived_at', null).order('position')
  return error ? null : (data as MnemeHabit[])
}

/** How far a habit is on a day (0 when nothing's logged). */
export async function habitValue(habitId: string, day: string): Promise<number> {
  const { data, error } = await supabase.schema('mneme').from('habit_logs').select('value').eq('habit_id', habitId).eq('day', day).maybeSingle()
  if (error) throw toError(error)
  return (data as { value: number } | null)?.value ?? 0
}

/** Move a habit by `delta` on a day, through Mneme's own atomic bump_habit(); returns the new value. */
export async function bumpHabit(habitId: string, day: string, delta: number): Promise<number> {
  const { data, error } = await supabase.schema('mneme').rpc('bump_habit', { p_habit: habitId, p_day: day, p_delta: delta })
  if (error) throw toError(error)
  return Number(data ?? 0)
}

/** Your Argus expense categories, or null when Argus isn't reachable. */
export async function argusCategories(): Promise<ArgusCategory[] | null> {
  const { data, error } = await supabase.schema('public').from('categories').select('id,name').eq('type', 'expense').eq('archived', false).order('sort_order')
  return error ? null : (data as ArgusCategory[])
}

/** Spending in the given Argus categories, per day, over [from, to] (pages through any number of expenses). */
export async function foodSpending(categoryIds: string[], from: string, to: string): Promise<{ day: string; amount: number }[]> {
  if (!categoryIds.length) return []
  const byDay = new Map<string, number>()
  for (let page = 0; ; page++) {
    const { data, error } = await supabase.schema('public').from('expenses').select('amount,expense_date')
      .in('category_id', categoryIds).gte('expense_date', from).lte('expense_date', to).order('expense_date').range(page * 1000, page * 1000 + 999)
    if (error) throw toError(error)
    for (const e of data as { amount: number | string; expense_date: string }[]) byDay.set(e.expense_date, (byDay.get(e.expense_date) ?? 0) + Number(e.amount))
    if (data.length < 1000) break
  }
  return [...byDay].map(([day, amount]) => ({ day, amount }))
}
