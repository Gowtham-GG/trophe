import { barcodeVariants } from '@/lib/external'
import { supabase } from '@/lib/supabase'
import type { Food, FoodServing, QuickLogFood, SuggestedFood } from '@/types/db'
import { toError } from './errors'

const FOOD_COLUMNS = 'id,user_id,name,brand,source,external_id,barcode,kcal,protein_g,carbs_g,fat_g,fiber_g,sugar_g,sodium_mg,micros,recipe_cooked_g,recipe_portions,archived_at,created_at,updated_at'

/** Your own foods: every word must match name or brand. Empty query = all (most used first). */
export async function searchFoods(query: string, opts: { archived?: boolean; limit?: number } = {}): Promise<Food[]> {
  const { data, error } = await supabase.rpc('search_foods', { p_query: query, p_limit: opts.limit ?? 30, p_archived: opts.archived ?? false })
  if (error) throw toError(error)
  return (data as Food[]) ?? []
}

export async function fetchFood(id: string): Promise<Food | null> {
  const { data, error } = await supabase.from('foods').select(FOOD_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw toError(error)
  return data as Food | null
}

export type FoodInput = Pick<Food, 'name' | 'brand' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g' | 'sugar_g' | 'sodium_mg' | 'barcode'> & { micros?: Food['micros'] }

/** Your food with this barcode (in any of its written forms), archived or not; the active one first. */
export async function findFoodByBarcode(code: string): Promise<Food | null> {
  const { data, error } = await supabase.from('foods').select(FOOD_COLUMNS).in('barcode', barcodeVariants(code))
    .order('archived_at', { ascending: false, nullsFirst: true }).order('updated_at', { ascending: false }).limit(1)
  if (error) throw toError(error)
  return (data as Food[])[0] ?? null
}

export async function createFood(input: FoodInput): Promise<Food> {
  const { data, error } = await supabase.from('foods').insert(input).select(FOOD_COLUMNS).single()
  if (error) throw toError(error)
  return data as Food
}

export async function updateFood(id: string, patch: Partial<FoodInput> & { archived_at?: string | null }): Promise<Food> {
  const { data, error } = await supabase.from('foods').update(patch).eq('id', id).select(FOOD_COLUMNS).single()
  if (error) throw toError(error)
  return data as Food
}

export const archiveFood = (id: string) => updateFood(id, { archived_at: new Date().toISOString() })
export const restoreFood = (id: string) => updateFood(id, { archived_at: null })

/** Deleting keeps every diary entry (they hold their own copy of the numbers); saved meals lose the item. */
export async function deleteFood(id: string): Promise<void> {
  const { error } = await supabase.from('foods').delete().eq('id', id)
  if (error) throw toError(error)
}

export async function fetchServings(foodId: string): Promise<FoodServing[]> {
  const { data, error } = await supabase.from('food_servings').select('id,food_id,label,grams,position').eq('food_id', foodId).order('position').order('created_at')
  if (error) throw toError(error)
  return (data as FoodServing[]) ?? []
}

/** Replace a food's servings with this list (small lists: delete + insert in two calls). */
export async function saveServings(foodId: string, servings: { label: string; grams: number }[]): Promise<FoodServing[]> {
  const del = await supabase.from('food_servings').delete().eq('food_id', foodId)
  if (del.error) throw toError(del.error)
  if (servings.length === 0) return []
  const { data, error } = await supabase.from('food_servings')
    .insert(servings.map((s, i) => ({ food_id: foodId, label: s.label, grams: s.grams, position: i })))
    .select('id,food_id,label,grams,position')
  if (error) throw toError(error)
  return (data as FoodServing[]) ?? []
}

export async function recentFoods(meal: string | null, limit = 12): Promise<SuggestedFood[]> {
  const { data, error } = await supabase.rpc('recent_foods', { p_meal: meal, p_limit: limit })
  if (error) throw toError(error)
  return (data as SuggestedFood[]) ?? []
}

/** Every active food with servings and last amount, most logged first (what quick add by typing matches against). */
export async function quickLogFoods(): Promise<QuickLogFood[]> {
  const { data, error } = await supabase.rpc('quick_log_foods', {})
  if (error) throw toError(error)
  return (data as QuickLogFood[]) ?? []
}

export async function frequentFoods(meal: string | null, limit = 12): Promise<SuggestedFood[]> {
  const { data, error } = await supabase.rpc('frequent_foods', { p_meal: meal, p_limit: limit })
  if (error) throw toError(error)
  return (data as SuggestedFood[]) ?? []
}
