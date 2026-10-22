import { describe, expect, it } from 'vitest'
// Real responses, saved once: the shapes these APIs actually return.
import offSearch from '../../tests/fixtures/off-search.json'
import usdaFood from '../../tests/fixtures/usda-food.json'
import usdaSearch from '../../tests/fixtures/usda-search.json'
import { dedupe, fromOff, fromUsda, plausible, usdaPortionLabel, type ExternalFood, type OffProduct, type UsdaFood } from './external'

describe('Open Food Facts', () => {
  const hits = offSearch.hits as OffProduct[]
  it('keeps products with nutrition, skips the ones without', () => {
    const foods = hits.map(fromOff).filter(Boolean) as ExternalFood[]
    expect(foods.map((f) => f.external_id)).toEqual(['8901262010030', '8901262010016'])
  })
  it('maps per-100 g values, salt → sodium, first brand, barcode', () => {
    const f = fromOff(hits.find((h) => h.code === '8901262010016')!)!
    expect(f).toMatchObject({ source: 'off', name: 'Amul Pasteurized Butter', brand: 'Amul', barcode: '8901262010016', kcal: 714.3, fat_g: 78.6, protein_g: 0, sodium_mg: 821.4 })
  })
  it('kJ-only energy, string brands, serving size', () => {
    const f = fromOff({ code: '123456789', product_name: 'Biscuit', brands: 'Parle, Parle Products', serving_size: '4 biscuits (22 g)', serving_quantity: '22',
      nutriments: { energy_100g: 1900, proteins_100g: 7, carbohydrates_100g: 77, fat_100g: 13, salt_100g: 0.5 } })!
    expect(f).toMatchObject({ kcal: 454.1, brand: 'Parle', sodium_mg: 200, servings: [{ label: '4 biscuits (22 g)', grams: 22 }] })
  })
  it('rejects impossible numbers instead of storing them', () => {
    expect(fromOff({ code: '1234567', product_name: 'Typo', nutriments: { 'energy-kcal_100g': 4540, proteins_100g: 7 } })).toBeNull()
    expect(fromOff({ code: '1234567', product_name: '', nutriments: { 'energy-kcal_100g': 100 } })).toBeNull()
  })
})

describe('USDA FoodData Central', () => {
  it('search results: nutrients by number', () => {
    const foods = (usdaSearch.foods as UsdaFood[]).map(fromUsda) as ExternalFood[]
    expect(foods.find((f) => f.external_id === '2709224')).toMatchObject({ source: 'usda', name: 'Banana, raw', kcal: 97, protein_g: 0.7, carbs_g: 22.7, fat_g: 0.3, fiber_g: 1.7, sodium_mg: 0, servings: [] })
  })
  it('detail: nutrients by nested number, portions become servings', () => {
    const f = fromUsda(usdaFood as UsdaFood)!
    expect(f.name).toBe('Bananas, raw')
    expect(f.kcal).toBe(89)
    expect(f.servings).toContainEqual({ label: '1 medium (7" to 7-7/8" long)', grams: 118 })
    expect(f.servings).toContainEqual({ label: '1 cup, sliced', grams: 150 })
    expect(f.servings.length).toBeLessThanOrEqual(8)
  })
  it('portion labels', () => {
    expect(usdaPortionLabel({ portionDescription: '1 medium', gramWeight: 118 })).toBe('1 medium')
    expect(usdaPortionLabel({ portionDescription: 'Quantity not specified', amount: 1, modifier: 'roti' })).toBe('1 roti')
    expect(usdaPortionLabel({ amount: 2, measureUnit: { name: 'tbsp' }, modifier: 'chopped' })).toBe('2 tbsp chopped')
    // a numeric portion code is not a name: "1 90000" would be meaningless
    expect(usdaPortionLabel({ amount: 1, modifier: '90000', gramWeight: 123 })).toBeNull()
    expect(fromUsda({ fdcId: 1, description: 'Cheese, paneer', foodNutrients: [{ nutrientNumber: '208', value: 299 }],
      foodPortions: [{ amount: 1, modifier: 'cup', gramWeight: 246 }, { amount: 1, modifier: '90000', gramWeight: 123 }] })!.servings)
      .toEqual([{ label: '1 cup', grams: 246 }])
  })
})

describe('shared', () => {
  it('plausibility mirrors the database checks', () => {
    expect(plausible({ name: 'x', kcal: 950, protein_g: 0, carbs_g: 0, fat_g: 100 })).toBe(true)
    expect(plausible({ name: 'x', kcal: 951, protein_g: 0, carbs_g: 0, fat_g: 0 })).toBe(false)
    expect(plausible({ name: 'x', kcal: 400, protein_g: 60, carbs_g: 40, fat_g: 10 })).toBe(false)
  })
  it('dedupe: leading zeros on barcodes', () => {
    const a = fromOff({ code: '890126201003', product_name: 'A', nutriments: { 'energy-kcal_100g': 700 } })!
    const b = fromOff({ code: '0890126201003', product_name: 'A', nutriments: { 'energy-kcal_100g': 700 } })!
    expect(dedupe([a, b])).toHaveLength(1)
  })
})
