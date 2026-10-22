import { describe, expect, it } from 'vitest'
import { MEALS, mealForHour } from './meals'

describe('meals', () => {
  it('lists the four default slots in eating order', () => {
    expect(MEALS.map((m) => m.id)).toEqual(['breakfast', 'lunch', 'snacks', 'dinner'])
  })
  it('picks the meal from the hour of day', () => {
    expect(mealForHour(7)).toBe('breakfast')
    expect(mealForHour(13)).toBe('lunch')
    expect(mealForHour(17)).toBe('snacks')
    expect(mealForHour(21)).toBe('dinner')
    // after midnight is still "dinner" (a late meal), until early morning
    expect(mealForHour(1)).toBe('dinner')
    expect(mealForHour(4)).toBe('breakfast')
  })
})
