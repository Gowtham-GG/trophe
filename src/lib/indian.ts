// A starter list of everyday Indian dishes (src/data/indian-dishes.json), searched in the browser: no database rows
// and no API calls until one is picked. The numbers are Trophe's own estimates for a typical home recipe (per 100 g
// as eaten), not copied from a licensed table, so recipes at home will differ; the user can edit their copy.
import type { ExternalFood } from './external'

export interface IndianDish {
  id: string
  name: string
  /** what people type: "roti", "chapati", "phulka" */
  aliases: string[]
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number | null
  servings: { label: string; grams: number }[]
}

/** The list is ~15 kB, so it's only loaded when the log dialog first needs it. */
export const loadIndianDishes = () => import('@/data/indian-dishes.json').then((m) => m.default as IndianDish[])

/** Picking a dish copies it into your foods like any online food (source "ifct", see migration 08). */
export function dishToExternal(d: IndianDish): ExternalFood {
  return {
    source: 'ifct', external_id: d.id, name: d.name, brand: null, barcode: null,
    kcal: d.kcal, protein_g: d.protein_g, carbs_g: d.carbs_g, fat_g: d.fat_g, fiber_g: d.fiber_g, sugar_g: null, sodium_mg: null,
    servings: d.servings,
  }
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)

/**
 * Dishes where every typed word starts a word of the name or an alias ("dal mak" → Dal makhani). An exact alias
 * ranks first, then a name or alias that starts with the query, then the rest in list order.
 */
export function searchIndianDishes(query: string, dishes: IndianDish[], limit = 6): IndianDish[] {
  const q = words(query)
  if (!q.length) return []
  const phrase = q.join(' ')
  const scored: { d: IndianDish; score: number; i: number }[] = []
  dishes.forEach((d, i) => {
    const names = [d.name, ...d.aliases].map((n) => words(n))
    const hit = names.some((n) => q.every((w) => n.some((x) => x.startsWith(w))))
    if (!hit) return
    const joined = names.map((n) => n.join(' '))
    const score = joined.includes(phrase) ? 2 : joined.some((n) => n.startsWith(phrase)) ? 1 : 0
    scored.push({ d, score, i })
  })
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).slice(0, limit).map((s) => s.d)
}
