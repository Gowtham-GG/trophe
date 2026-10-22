import { describe, expect, it } from 'vitest'
import { initialAmount, parseQty, resolveAmount } from './amount'

const servings = [{ id: 's1', label: '1 roti', grams: 40 }, { id: 's2', label: '1 katori', grams: 150 }]

describe('amount', () => {
  it('resolves servings and grams', () => {
    expect(resolveAmount({ unit: 's1', qty: 2 }, servings)).toEqual({ grams: 80, serving_label: '1 roti', serving_qty: 2 })
    expect(resolveAmount({ unit: 'g', qty: 123.45 }, servings)).toEqual({ grams: 123.5, serving_label: null, serving_qty: null })
    expect(resolveAmount({ unit: 's2', qty: 0 }, servings)).toBeNull()
    expect(resolveAmount({ unit: 'gone', qty: 1 }, servings)).toBeNull()
  })
  it('starts from last time, then the first serving, then 100 g', () => {
    expect(initialAmount(servings, { grams: 300, serving_label: '1 katori', serving_qty: 2 })).toEqual({ unit: 's2', qty: 2 })
    expect(initialAmount(servings, { grams: 75, serving_label: 'deleted serving', serving_qty: 1 })).toEqual({ unit: 'g', qty: 75 })
    expect(initialAmount(servings)).toEqual({ unit: 's1', qty: 1 })
    expect(initialAmount([])).toEqual({ unit: 'g', qty: 100 })
  })
  it('parses friendly quantities', () => {
    expect(parseQty('1.5')).toBe(1.5)
    expect(parseQty('1,5')).toBe(1.5)
    expect(parseQty('½')).toBe(0.5)
    expect(parseQty('1 ½')).toBe(1.5)
    expect(parseQty('.5')).toBe(0.5)
    expect(parseQty('')).toBeNaN()
    expect(parseQty('abc')).toBeNaN()
  })
})
