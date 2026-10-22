// Row shapes of the `trophe` schema, as PostgREST returns them (numeric → number).
export type { ThemePref } from '@/lib/themes'
import type { ThemePref } from '@/lib/themes'
import type { Micros } from '@/lib/micros'

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
  water_goal_ml: number
}

/** Nutrients per 100 g. */
export interface Food {
  id: string
  user_id: string
  name: string
  brand: string | null
  source: 'custom' | 'off' | 'usda' | 'ifct' | 'recipe'
  external_id: string | null
  barcode: string | null
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number | null
  sugar_g: number | null
  sodium_mg: number | null
  /** per 100 g; see src/lib/micros.ts. Null when the food lists none */
  micros: Micros | null
  /** recipes only: the whole pot after cooking (null = the raw total), and how many portions it makes */
  recipe_cooked_g: number | null
  recipe_portions: number | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

/** One ingredient of a recipe, with the ingredient food (and its servings, for editing the amount). */
export interface RecipeItem {
  id: string
  food_id: string
  grams: number
  serving_label: string | null
  serving_qty: number | null
  position: number
  food: Pick<Food, 'id' | 'name' | 'brand' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g'> & { food_servings: Pick<FoodServing, 'id' | 'label' | 'grams' | 'position'>[] }
}

export interface FoodServing {
  id: string
  food_id: string
  label: string
  grams: number
  position: number
}

/** One weigh-in with the smoothed trend on that day (weight_trend). */
export interface WeightPoint { day: string; kg: number; trend: number }

/** weight_summary(): the latest weigh-in and trend, the first one, and the trend's pace (kg / week, null until 7 days apart). */
export interface WeightSummary {
  latest: WeightPoint | null
  first: { day: string; kg: number } | null
  count: number
  week_rate: number | null
}

export const MEASURES = ['waist_cm', 'hips_cm', 'chest_cm', 'neck_cm', 'arm_cm', 'thigh_cm', 'body_fat_pct'] as const
export type MeasureKey = (typeof MEASURES)[number]
export type Measurement = { day: string } & Record<MeasureKey, number | null>

export interface WaterEntry { id: string; day: string; ml: number; logged_at: string }

/** nutrition_periods(): one week (from Monday) or month; averages over the days with something logged. */
export interface NutritionPeriod {
  period_start: string
  days: number
  logged_days: number
  kcal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  goal_kcal: number | null
  on_target: number
}

/** nutrition_stats(): the whole range at once. */
export interface NutritionStats {
  days: number
  logged_days: number
  avg: { kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null }
  avg_goal_kcal: number | null
  weekday: { kcal: number | null; days: number }
  weekend: { kcal: number | null; days: number }
  status: { on: number; under: number; over: number; logged: number }
}

export interface Streaks { logging_current: number; logging_best: number; target_current: number; target_best: number }

/** micros_summary(): averages per logged day over a range, and how many entries carried micronutrient data. */
export interface MicrosSummary { logged_days: number; entries: number; with_micros: number; sugar_g: number | null; sodium_mg: number | null; micros: Micros }

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
  /** this entry's own micronutrients (copied when logged) */
  micros: Micros | null
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
  /** the pace the goal was set for, kg / week (negative = lose); null when typed in by hand */
  pace_kg_week?: number | null
}

/** maintenance_estimate(): maintenance measured from the last 4 weeks of intake and weight trend. */
export interface MaintenanceEstimate {
  from: string
  to: string
  days: number
  logged_days: number
  avg_kcal: number | null
  weigh_ins: number
  trend_from: { day: string; trend: number } | null
  trend_to: { day: string; trend: number } | null
  change_kg: number | null
  estimate_kcal: number | null
  /** none = not enough data; low = the numbers don't look like a real maintenance (meals probably missing) */
  confidence: 'none' | 'low' | 'medium' | 'high'
  needs: ({ kind: 'log'; count: number } | { kind: 'weigh'; count: number; span: number })[]
  goal_kcal: number | null
  pace_kg_week: number | null
  suggested_kcal: number | null
}

/** insights(): one rule that applies to your last days; the app words it (src/lib/insights.ts). */
export interface Insight { kind: string; tone: 'warn' | 'note' | 'good'; data: Record<string, number | string> }

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

/** quick_log_foods(): an active food with its servings and last amount, for the quick-add parser. */
export interface QuickLogFood {
  id: string
  name: string
  brand: string | null
  source: Food['source']
  external_id: string | null
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number | null
  uses: number
  servings: Pick<FoodServing, 'id' | 'label' | 'grams'>[]
  last: { grams: number; serving_label: string | null; serving_qty: number | null } | null
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
