import { supabase } from '@/lib/supabase'
import type { GroceryItem, PlanDay, PlanItem } from '@/types/db'
import type { FoodEntry } from './diary'
import { toError } from './errors'

const COLUMNS = 'id,day,meal,food_id,grams,serving_label,serving_qty,position,created_at,food:foods!plan_items_food_fkey(name,brand,kcal,protein_g,carbs_g,fat_g)'

/** Planned items in [from, to], in day / meal / position order. */
export async function fetchPlan(from: string, to: string): Promise<PlanItem[]> {
  const { data, error } = await supabase.from('plan_items').select(COLUMNS).gte('day', from).lte('day', to).order('day').order('position').order('created_at')
  if (error) throw toError(error)
  return (data as unknown as PlanItem[]) ?? []
}

export async function planFoods(entries: FoodEntry[]): Promise<PlanItem[]> {
  if (!entries.length) return []
  const { data, error } = await supabase.from('plan_items').insert(entries.map((e, i) => ({ position: i, ...e }))).select(COLUMNS)
  if (error) throw toError(error)
  return (data as unknown as PlanItem[]) ?? []
}

export async function deletePlanItems(ids: string[]): Promise<void> {
  const { error } = await supabase.from('plan_items').delete().in('id', ids)
  if (error) throw toError(error)
}

/** A saved meal into the plan; returns how many items went in. */
export async function planTemplate(id: string, day: string, meal: string): Promise<number> {
  const { data, error } = await supabase.rpc('plan_template', { p_template: id, p_day: day, p_meal: meal })
  if (error) throw toError(error)
  return Number(data ?? 0)
}

/** Log a planned day, or one meal of it: its items move into the diary. Returns how many. */
export async function logPlan(day: string, meal: string | null = null): Promise<number> {
  const { data, error } = await supabase.rpc('log_plan', { p_day: day, p_meal: meal })
  if (error) throw toError(error)
  return Number(data ?? 0)
}

export async function planDays(from: string, to: string): Promise<PlanDay[]> {
  const { data, error } = await supabase.rpc('plan_days', { p_from: from, p_to: to })
  if (error) throw toError(error)
  return (data as PlanDay[]) ?? []
}

export const groceryKey = (from: string, to: string) => `${from}..${to}`

export async function groceryList(from: string, to: string): Promise<GroceryItem[]> {
  const { data, error } = await supabase.rpc('grocery_list', { p_from: from, p_to: to })
  if (error) throw toError(error)
  return (data as GroceryItem[]) ?? []
}

export async function setGroceryCheck(from: string, to: string, foodId: string, checked: boolean): Promise<void> {
  const q = checked
    ? supabase.from('grocery_checks').upsert({ list_key: groceryKey(from, to), food_id: foodId }, { onConflict: 'user_id,list_key,food_id', ignoreDuplicates: true })
    : supabase.from('grocery_checks').delete().eq('list_key', groceryKey(from, to)).eq('food_id', foodId)
  const { error } = await q
  if (error) throw toError(error)
}
