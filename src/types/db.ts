// Row shapes of the `trophe` schema, as PostgREST returns them (numeric → number).
export type { ThemePref } from '@/lib/themes'
import type { ThemePref } from '@/lib/themes'

export type Sex = 'male' | 'female'
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'

export interface Settings {
  user_id: string
  timezone: string
  theme: ThemePref
  sex: Sex | null
  birth_year: number | null
  height_cm: number | null
  activity: Activity | null
}

/** Nutrients per 100 g. */
export interface Food {
  id: string
  user_id: string
  name: string
  brand: string | null
  source: 'custom' | 'off' | 'usda' | 'ifct'
  external_id: string | null
  barcode: string | null
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number | null
  sugar_g: number | null
  sodium_mg: number | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface FoodServing {
  id: string
  food_id: string
  label: string
  grams: number
  position: number
}

/** A logged item: nutrients are this entry's own totals (copied when logged). */
export interface DiaryEntry {
  id: string
  day: string
  meal: string
  food_id: string | null
  name: string
  brand: string | null
  grams: number | null
  serving_label: string | null
  serving_qty: number | null
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number | null
  sugar_g: number | null
  sodium_mg: number | null
  position: number
  logged_at: string
}

export interface Goal {
  id?: string
  effective_from: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number | null
}

export interface MacroTotals { kcal: number; protein_g: number; carbs_g: number; fat_g: number; entries: number }

export interface DaySummary {
  day: string
  goal: Goal | null
  totals: MacroTotals & { fiber_g: number | null }
  meals: Record<string, MacroTotals>
}

export type DayStatus = 'empty' | 'logged' | 'under' | 'on' | 'over'

export interface RangeDay {
  day: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  entries: number
  goal_kcal: number | null
  status: DayStatus
}

/** A food from recent_foods / frequent_foods, with the amount you had last time. */
export interface SuggestedFood {
  id: string
  name: string
  brand: string | null
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  last_grams: number
  last_serving_label: string | null
  last_serving_qty: number | null
  last_logged_at: string
  uses: number
}

export interface MealTemplateItem {
  id: string
  food_id: string
  grams: number
  serving_label: string | null
  serving_qty: number | null
  position: number
  foods: Pick<Food, 'name' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'archived_at'> | null
}

export interface MealTemplate {
  id: string
  name: string
  created_at: string
  meal_template_items: MealTemplateItem[]
}
