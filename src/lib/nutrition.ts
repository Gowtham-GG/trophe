// Nutrition maths, pure and unit-tested. The database computes what gets STORED (diary_before_write);
// these give the same numbers for live previews and power the goal wizard.
import type { Activity, Sex } from '@/types/db'

export interface Per100 { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g?: number | null }
export interface Amount { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number | null }

const r1 = (n: number) => Math.round(n * 10) / 10

/** Nutrients in `grams` of a food given per 100 g, rounded like the database (0.1). */
export function scale(food: Per100, grams: number): Amount {
  const k = grams / 100
  return {
    kcal: r1(food.kcal * k), protein_g: r1(food.protein_g * k), carbs_g: r1(food.carbs_g * k), fat_g: r1(food.fat_g * k),
    fiber_g: food.fiber_g == null ? null : r1(food.fiber_g * k),
  }
}

/** Energy implied by macros (Atwater 4/4/9): flags a food whose numbers don't add up. */
export const kcalFromMacros = (p: number, c: number, f: number) => p * 4 + c * 4 + f * 9

// ---------------------------------------------------------------- goal wizard --

export const ACTIVITY: Record<Activity, { factor: number; label: string; hint: string }> = {
  sedentary: { factor: 1.2, label: 'Sedentary', hint: 'Desk job, little exercise' },
  light: { factor: 1.375, label: 'Lightly active', hint: 'Exercise 1–3 days a week' },
  moderate: { factor: 1.55, label: 'Moderately active', hint: 'Exercise 3–5 days a week' },
  active: { factor: 1.725, label: 'Very active', hint: 'Hard exercise 6–7 days a week' },
  very_active: { factor: 1.9, label: 'Athlete', hint: 'Physical job or training twice a day' },
}

/** Basal metabolic rate, Mifflin–St Jeor (kcal/day). */
export function bmr(sex: Sex, kg: number, cm: number, age: number): number {
  return 10 * kg + 6.25 * cm - 5 * age + (sex === 'male' ? 5 : -161)
}

/** Maintenance calories: BMR × activity factor. */
export function tdee(sex: Sex, kg: number, cm: number, age: number, activity: Activity): number {
  return bmr(sex, kg, cm, age) * ACTIVITY[activity].factor
}

/** ~7700 kcal per kg of body weight. */
export const KCAL_PER_KG = 7700

/** The lowest daily target the wizard will suggest without a warning. */
export const minKcal = (sex: Sex) => (sex === 'male' ? 1500 : 1200)

/**
 * Daily calorie target for a weekly pace in kg (negative = lose, positive = gain), rounded to 10.
 * Never below the safe minimum; `clamped` says when that kicked in.
 */
export function targetKcal(maintenance: number, paceKgPerWeek: number, sex: Sex): { kcal: number; clamped: boolean } {
  const raw = maintenance + (paceKgPerWeek * KCAL_PER_KG) / 7
  const min = minKcal(sex)
  return { kcal: Math.round(Math.max(raw, min) / 10) * 10, clamped: raw < min }
}

/**
 * Macro grams for a calorie target: protein from g per kg of body weight, fat as a share of calories,
 * carbs fill the rest (never negative). Fibre: 14 g per 1000 kcal.
 */
export function macroTargets(kcal: number, kg: number, proteinPerKg: number, fatPct: number) {
  const protein_g = Math.round(kg * proteinPerKg)
  const fat_g = Math.round((kcal * fatPct) / 100 / 9)
  const carbs_g = Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4))
  const fiber_g = Math.round((kcal / 1000) * 14)
  return { protein_g, carbs_g, fat_g, fiber_g }
}

/**
 * A goal moved to a new calorie target: protein stays (it's set per kg of body weight, but never above 60 % of
 * calories), fat stays unless what's left can't hold it, and carbs take the difference. Fibre follows calories.
 */
export function rescaleGoal(g: { protein_g: number; fat_g: number }, kcal: number): { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number } {
  const protein_g = Math.min(g.protein_g, Math.floor((kcal * 0.6) / 4))
  const fat_g = Math.min(g.fat_g, Math.floor((kcal - protein_g * 4) / 9))
  const carbs_g = Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4))
  return { kcal, protein_g, carbs_g, fat_g, fiber_g: Math.round((kcal / 1000) * 14) }
}

export const ageIn = (birthYear: number, today: string) => Number(today.slice(0, 4)) - birthYear

// ------------------------------------------------------------------ display --

/** 237.6 → "238"; 1234 → "1,234". */
export const fmtKcal = (n: number) => Math.round(n).toLocaleString('en-IN')

/** Grams with at most one decimal and no trailing ".0": 8.8 → "8.8", 36 → "36". */
export const fmtG = (n: number) => String(Math.round(n * 10) / 10)

/** How an entry was entered: "2 × 1 roti (80 g)", "150 g", or "" for a quick add. */
export function describeAmount(e: { grams: number | null; serving_label: string | null; serving_qty: number | null }): string {
  if (e.grams == null) return ''
  if (e.serving_label && e.serving_qty) {
    const qty = fmtG(e.serving_qty)
    return `${qty === '1' ? '' : `${qty} × `}${e.serving_label} (${fmtG(e.grams)} g)`
  }
  return `${fmtG(e.grams)} g`
}
