import { supabase } from '@/lib/supabase'
import type { RecipeItem } from '@/types/db'
import { toError } from './errors'

/** A recipe's ingredients in order, each with its food and that food's servings. */
export async function fetchRecipeItems(recipeId: string): Promise<RecipeItem[]> {
  const { data, error } = await supabase.from('recipe_items')
    .select('id,food_id,grams,serving_label,serving_qty,position,food:foods!recipe_items_food_fkey(id,name,brand,kcal,protein_g,carbs_g,fat_g,fiber_g,food_servings(id,label,grams,position))')
    .eq('recipe_id', recipeId).order('position')
  if (error) throw toError(error)
  return (data as unknown as RecipeItem[]) ?? []
}

export interface RecipeInput {
  name: string
  items: { food_id: string; grams: number; serving_label: string | null; serving_qty: number | null }[]
  cooked_g: number | null
  portions: number | null
}

/** Create (id null) or replace a recipe; the database works out its numbers per 100 g and "1 portion". */
export async function saveRecipe(id: string | null, r: RecipeInput): Promise<string> {
  const { data, error } = await supabase.rpc('save_recipe', { p_id: id, p_name: r.name, p_items: r.items, p_cooked_g: r.cooked_g, p_portions: r.portions })
  if (error) throw toError(error)
  return data as string
}
