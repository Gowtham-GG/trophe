import { describe, expect, it } from 'vitest'
import { ageIn, bmr, describeAmount, fmtG, fmtKcal, kcalFromMacros, macroTargets, rescaleGoal, scale, targetKcal, tdee } from './nutrition'

const chapati = { kcal: 297, protein_g: 11, carbs_g: 46, fat_g: 7.5, fiber_g: 9 }

describe('nutrition', () => {
  it('scales per-100 g values like the database', () => {
    // same numbers as the SQL test (diary_before_write)
    expect(scale(chapati, 80)).toEqual({ kcal: 237.6, protein_g: 8.8, carbs_g: 36.8, fat_g: 6, fiber_g: 7.2 })
    expect(scale({ ...chapati, fiber_g: null }, 100).fiber_g).toBeNull()
  })
  it('Atwater energy from macros', () => {
    expect(kcalFromMacros(11, 46, 7.5)).toBe(295.5)
  })
  it('Mifflin–St Jeor BMR and TDEE', () => {
    expect(bmr('male', 70, 175, 28)).toBe(1658.75)
    expect(bmr('female', 60, 162, 30)).toBe(1301.5)
    expect(Math.round(tdee('male', 70, 175, 28, 'moderate'))).toBe(2571)
  })
  it('targets: a deficit of 0.5 kg/week ≈ 550 kcal/day, never below the safe minimum', () => {
    expect(targetKcal(2571, -0.5, 'male')).toEqual({ kcal: 2020, clamped: false })
    expect(targetKcal(2571, 0, 'male').kcal).toBe(2570)
    expect(targetKcal(2571, 0.25, 'male').kcal).toBe(2850)
    expect(targetKcal(1500, -1, 'female')).toEqual({ kcal: 1200, clamped: true })
  })
  it('macro targets add up to the calories', () => {
    const m = macroTargets(2000, 70, 1.6, 25)
    expect(m).toEqual({ protein_g: 112, carbs_g: 262, fat_g: 56, fiber_g: 28 })
    expect(Math.abs(m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9 - 2000)).toBeLessThan(10)
    expect(macroTargets(1200, 120, 2.2, 35).carbs_g).toBe(0) // protein+fat already over → carbs 0, not negative
  })
  it('age from birth year', () => {
    expect(ageIn(1998, '2026-10-22')).toBe(28)
  })
  it('display helpers', () => {
    expect(fmtKcal(237.6)).toBe('238')
    expect(fmtKcal(12345)).toBe('12,345')
    expect(fmtG(8.8)).toBe('8.8')
    expect(fmtG(36.0)).toBe('36')
    expect(describeAmount({ grams: 80, serving_label: '1 roti', serving_qty: 2 })).toBe('2 × 1 roti (80 g)')
    expect(describeAmount({ grams: 40, serving_label: '1 roti', serving_qty: 1 })).toBe('1 roti (40 g)')
    expect(describeAmount({ grams: 150, serving_label: null, serving_qty: null })).toBe('150 g')
    expect(describeAmount({ grams: null, serving_label: null, serving_qty: null })).toBe('')
  })
})

describe('rescaleGoal', () => {
  it('keeps protein and fat, carbs take the difference', () => {
    expect(rescaleGoal({ protein_g: 130, fat_g: 60 }, 1650)).toEqual({ kcal: 1650, protein_g: 130, carbs_g: 148, fat_g: 60, fiber_g: 23 })
    expect(rescaleGoal({ protein_g: 130, fat_g: 60 }, 2400)).toMatchObject({ protein_g: 130, fat_g: 60, carbs_g: 335 })
  })
  it('a target too small for them trims protein to 60 % and fat to what is left', () => {
    const r = rescaleGoal({ protein_g: 200, fat_g: 90 }, 1200)
    expect(r).toEqual({ kcal: 1200, protein_g: 180, carbs_g: 1, fat_g: 53, fiber_g: 17 })
    expect(r.protein_g * 4 + r.fat_g * 9).toBeLessThanOrEqual(1200)
  })
})
