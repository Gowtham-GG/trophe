import { supabase } from '@/lib/supabase'
import type { MealTemplate } from '@/types/db'
import { toError } from './errors'

export async function listTemplates(): Promise<MealTemplate[]> {
  const { data, error } = await supabase.from('meal_templates')
    .select('id,name,created_at,meal_template_items(id,food_id,grams,serving_label,serving_qty,position,foods(name,kcal,protein_g,carbs_g,fat_g,archived_at))')
    .order('name')
  if (error) throw toError(error)
  return (data as unknown as MealTemplate[]) ?? []
}

/** Save the foods logged at one meal as a reusable saved meal. */
export async function saveMealAsTemplate(name: string, day: string, meal: string): Promise<string> {
  const { data, error } = await supabase.rpc('save_meal_template', { p_name: name, p_day: day, p_meal: meal })
  if (error) throw toError(error)
  return data as string
}

export async function logTemplate(templateId: string, day: string, meal: string): Promise<number> {
  const { data, error } = await supabase.rpc('log_meal_template', { p_template: templateId, p_day: day, p_meal: meal })
  if (error) throw toError(error)
  return Number(data ?? 0)
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('meal_templates').delete().eq('id', id)
  if (error) throw toError(error)
}
