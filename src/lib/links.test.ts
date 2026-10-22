import { describe, expect, it } from 'vitest'
import { habitConditions, habitDelta } from './links'

describe('Mneme habit links', () => {
  it('reads the day', () => {
    expect(habitConditions({ entries: 3, protein_g: 131, protein_goal: 130 }, 2600, 2500)).toEqual({ protein: true, water: true, logged: true })
    expect(habitConditions({ entries: 0, protein_g: 0, protein_goal: null }, 500, 2500)).toEqual({ protein: null, water: false, logged: false })
  })
  it('fills a met habit to its target, once', () => {
    expect(habitDelta(true, 0, 1, false)).toBe(1)
    expect(habitDelta(true, 3, 8, false)).toBe(5)
    expect(habitDelta(true, 8, 8, true)).toBe(0)
  })
  it('empties it again only if Trophe filled it and nobody changed it', () => {
    expect(habitDelta(false, 1, 1, true)).toBe(-1)
    expect(habitDelta(false, 1, 1, false)).toBe(0) // ticked by hand in Mneme: left alone
    expect(habitDelta(false, 9, 8, true)).toBe(0) // changed since: left alone
    expect(habitDelta(null, 0, 1, false)).toBe(0)
  })
})
