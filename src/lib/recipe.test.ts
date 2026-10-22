import { describe, expect, it } from 'vitest'
import { recipeNumbers } from './recipe'

const rice = { kcal: 360, protein_g: 7, carbs_g: 79, fat_g: 0.6, fiber_g: 1.3 }
const dal = { kcal: 340, protein_g: 22, carbs_g: 60, fat_g: 1.5, fiber_g: 15 }
const ghee = { kcal: 900, protein_g: 0, carbs_g: 0, fat_g: 100, fiber_g: null }
const khichdi = [{ food: rice, grams: 200 }, { food: dal, grams: 100 }, { food: ghee, grams: 20 }]

describe('recipeNumbers', () => {
  it('matches what the database stores (see the SQL suite: Khichdi)', () => {
    const r = recipeNumbers(khichdi, 1000, 4)!
    expect(r.total).toEqual({ kcal: 1240, protein_g: 36, carbs_g: 218, fat_g: 22.7, fiber_g: 17.6 })
    expect(r.per100).toEqual({ kcal: 124, protein_g: 3.6, carbs_g: 21.8, fat_g: 2.3, fiber_g: 1.8 })
    expect(r.portion).toEqual({ grams: 250, kcal: 310, protein_g: 9, carbs_g: 54.5, fat_g: 5.7, fiber_g: 4.4 })
    expect([r.rawG, r.cookedG, r.tooDense]).toEqual([320, 1000, false])
  })
  it('uses the raw weight without a cooked weight, and has no portion without portions', () => {
    const r = recipeNumbers(khichdi, null, null)!
    expect(r.cookedG).toBe(320)
    expect(r.per100.kcal).toBe(387.5)
    expect(r.portion).toBeNull()
  })
  it('flags a cooked weight too low for the ingredients', () => {
    expect(recipeNumbers([{ food: ghee, grams: 100 }], 50, null)!.tooDense).toBe(true)
  })
  it('nothing to work out without ingredients', () => {
    expect(recipeNumbers([], 100, 2)).toBeNull()
  })
})
