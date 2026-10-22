// A recipe's numbers for the live preview in the recipe form. The database works out what gets STORED
// (trophe.recipe_recompute, migration 10); this is the same sum, so the preview matches it.
import type { Amount, Per100 } from './nutrition'

export interface RecipeNumbers {
  /** the raw ingredients' weight */
  rawG: number
  /** the cooked weight used (the raw weight when none is given) */
  cookedG: number
  total: Amount
  per100: Amount
  /** one portion (cooked weight / portions), when portions are given */
  portion: (Amount & { grams: number }) | null
  /** per 100 g would break the foods table's limits: the cooked weight is too low */
  tooDense: boolean
}

const r1 = (n: number) => Math.round(n * 10) / 10

export function recipeNumbers(items: { food: Per100; grams: number }[], cookedG: number | null, portions: number | null): RecipeNumbers | null {
  const rawG = items.reduce((s, i) => s + i.grams, 0)
  if (!items.length || rawG <= 0) return null
  const sum = (k: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g') => items.reduce((s, i) => s + (i.food[k] * i.grams) / 100, 0)
  const fibers = items.filter((i) => i.food.fiber_g != null)
  const total = { kcal: sum('kcal'), protein_g: sum('protein_g'), carbs_g: sum('carbs_g'), fat_g: sum('fat_g'), fiber_g: fibers.length ? fibers.reduce((s, i) => s + (i.food.fiber_g! * i.grams) / 100, 0) : null }
  const cooked = cookedG && cookedG > 0 ? cookedG : rawG
  const part = (div: number): Amount => ({
    kcal: r1(total.kcal / div), protein_g: r1(total.protein_g / div), carbs_g: r1(total.carbs_g / div), fat_g: r1(total.fat_g / div),
    fiber_g: total.fiber_g == null ? null : r1(total.fiber_g / div),
  })
  const per100 = part(cooked / 100)
  const tooDense = per100.kcal > 950 || per100.protein_g > 100 || per100.carbs_g > 100 || per100.fat_g > 100 || per100.protein_g + per100.carbs_g + per100.fat_g > 105
  return {
    rawG: r1(rawG), cookedG: r1(cooked), total: part(1), per100, tooDense,
    portion: portions && portions >= 1 ? { ...part(portions), grams: r1(cooked / portions) } : null,
  }
}
