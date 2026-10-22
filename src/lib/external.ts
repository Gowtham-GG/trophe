// Turns Open Food Facts and USDA FoodData Central records into Trophe's food shape (per 100 g).
// Shared by the Vercel function (api/food-search.ts) and the app; pure, unit-tested against real responses.

export type ExternalSource = 'off' | 'usda' | 'ifct'

export interface ExternalFood {
  source: ExternalSource
  external_id: string
  name: string
  brand: string | null
  barcode: string | null
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number | null
  sugar_g: number | null
  sodium_mg: number | null
  servings: { label: string; grams: number }[]
}

const r1 = (n: number) => Math.round(n * 10) / 10
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
const clean = (s: unknown, max: number): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Values the database would reject (see the foods table checks) make the whole record unusable. */
export function plausible(f: Pick<ExternalFood, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'name'>): boolean {
  const macros = [f.protein_g, f.carbs_g, f.fat_g]
  return !!f.name && f.kcal >= 0 && f.kcal <= 950 && macros.every((m) => m >= 0 && m <= 100) && f.protein_g + f.carbs_g + f.fat_g <= 105
}

// ---------------------------------------------------------------- Open Food Facts --

export interface OffProduct {
  code?: string
  product_name?: string
  product_name_en?: string
  brands?: string[] | string
  serving_size?: string
  serving_quantity?: number | string
  nutriments?: Record<string, unknown>
}

export function fromOff(p: OffProduct): ExternalFood | null {
  const n = p.nutriments ?? {}
  const code = clean(p.code, 32)
  const kcal = num(n['energy-kcal_100g']) ?? (num(n['energy_100g']) != null ? num(n['energy_100g'])! / 4.184 : null) // energy_100g is kJ
  if (!code || kcal == null) return null
  const sodiumG = num(n['sodium_100g']) ?? (num(n['salt_100g']) != null ? num(n['salt_100g'])! / 2.5 : null)
  const brand = clean(Array.isArray(p.brands) ? p.brands[0] : (p.brands ?? '').split(',')[0], 120) || null
  const name = clean(p.product_name || p.product_name_en, 120)
  const servingG = num(p.serving_quantity)
  const f: ExternalFood = {
    source: 'off', external_id: code, name, brand, barcode: /^\d{6,14}$/.test(code) ? code : null,
    kcal: r1(kcal), protein_g: r1(num(n['proteins_100g']) ?? 0), carbs_g: r1(num(n['carbohydrates_100g']) ?? 0), fat_g: r1(num(n['fat_100g']) ?? 0),
    fiber_g: num(n['fiber_100g']) == null ? null : r1(num(n['fiber_100g'])!),
    sugar_g: num(n['sugars_100g']) == null ? null : r1(num(n['sugars_100g'])!),
    sodium_mg: sodiumG == null ? null : r1(sodiumG * 1000),
    servings: servingG && servingG > 0 && servingG <= 5000 ? [{ label: clean(p.serving_size, 40) || '1 serving', grams: r1(servingG) }] : [],
  }
  return plausible(f) ? f : null
}

// ---------------------------------------------------------------------- USDA FDC --

interface UsdaNutrient { nutrientNumber?: string; value?: number; amount?: number; nutrient?: { number?: string } }
interface UsdaPortion { amount?: number; modifier?: string; portionDescription?: string; measureUnit?: { name?: string }; gramWeight?: number }
export interface UsdaFood { fdcId?: number; description?: string; brandOwner?: string; foodNutrients?: UsdaNutrient[]; foodPortions?: UsdaPortion[] }

/** Search results list nutrients as {nutrientNumber, value}; the detail endpoint as {nutrient: {number}, amount}. */
function usdaNutrients(f: UsdaFood): Map<string, number> {
  const m = new Map<string, number>()
  for (const n of f.foodNutrients ?? []) {
    const k = n.nutrientNumber ?? n.nutrient?.number
    const v = num(n.value ?? n.amount)
    if (k && v != null && !m.has(k)) m.set(k, v)
  }
  return m
}

/** "1 medium (7" to 7-7/8" long)" from the portion's parts; null for the meaningless ones. */
export function usdaPortionLabel(p: UsdaPortion): string | null {
  const desc = clean(p.portionDescription, 60)
  if (desc && !/quantity not specified/i.test(desc)) return desc.slice(0, 40)
  const unit = p.measureUnit?.name && p.measureUnit.name !== 'undetermined' ? p.measureUnit.name : ''
  // survey (FNDDS) portions without a description carry a numeric portion code as "modifier" (e.g. "90000")
  const modifier = /^\d+$/.test(clean(p.modifier, 40)) ? '' : p.modifier
  const label = clean([p.amount ?? 1, unit, modifier].filter(Boolean).join(' '), 40)
  return /[a-z]/i.test(label) ? label : null
}

export function fromUsda(f: UsdaFood): ExternalFood | null {
  const n = usdaNutrients(f)
  // 208 = Energy (kcal); Foundation foods may only carry the Atwater energies 957 / 958
  const kcal = n.get('208') ?? n.get('958') ?? n.get('957')
  if (!f.fdcId || kcal == null) return null
  const food: ExternalFood = {
    source: 'usda', external_id: String(f.fdcId), name: clean(f.description, 120), brand: clean(f.brandOwner, 120) || null, barcode: null,
    kcal: r1(kcal), protein_g: r1(n.get('203') ?? 0), carbs_g: r1(n.get('205') ?? 0), fat_g: r1(n.get('204') ?? 0),
    fiber_g: n.has('291') ? r1(n.get('291')!) : null, sugar_g: n.has('269') ? r1(n.get('269')!) : null, sodium_mg: n.has('307') ? r1(n.get('307')!) : null,
    servings: (f.foodPortions ?? [])
      .map((p) => ({ label: usdaPortionLabel(p), grams: num(p.gramWeight) }))
      .filter((s): s is { label: string; grams: number } => !!s.label && s.grams != null && s.grams > 0 && s.grams <= 5000)
      .map((s) => ({ label: s.label, grams: r1(s.grams) }))
      .slice(0, 8),
  }
  return plausible(food) ? food : null
}

/** Drop duplicates (same source + id, or OFF barcodes differing only by leading zeros). */
export function dedupe(foods: ExternalFood[]): ExternalFood[] {
  const seen = new Set<string>()
  return foods.filter((f) => {
    const key = `${f.source}:${f.source === 'off' ? f.external_id.replace(/^0+/, '') : f.external_id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
