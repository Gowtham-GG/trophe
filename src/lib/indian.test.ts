import { describe, expect, it } from 'vitest'
import dishes from '@/data/indian-dishes.json'
import { plausible } from './external'
import { dishToExternal, searchIndianDishes, type IndianDish } from './indian'
import { kcalFromMacros } from './nutrition'

const list = dishes as IndianDish[]

describe('the Indian dishes list', () => {
  it('has unique ids and aliases', () => {
    expect(new Set(list.map((d) => d.id)).size).toBe(list.length)
    const aliases = list.flatMap((d) => d.aliases)
    expect(aliases.filter((a, i) => aliases.indexOf(a) !== i)).toEqual([])
  })

  it('only holds values the foods table accepts', () => {
    for (const d of list) {
      const f = dishToExternal(d)
      expect(plausible(f), d.id).toBe(true)
      expect(f.external_id.length, d.id).toBeLessThanOrEqual(64)
      expect(f.name.length, d.id).toBeLessThanOrEqual(120)
      for (const s of d.servings) {
        expect(s.label.length, d.id).toBeLessThanOrEqual(40)
        expect(s.grams > 0 && s.grams <= 5000, d.id).toBe(true)
      }
    }
  })

  it('has calories that agree with the macros (within 15 %)', () => {
    for (const d of list) {
      const m = kcalFromMacros(d.protein_g, d.carbs_g, d.fat_g)
      expect(Math.abs(m - d.kcal), `${d.id}: ${m} vs ${d.kcal}`).toBeLessThanOrEqual(Math.max(10, d.kcal * 0.15))
    }
  })
})

describe('searchIndianDishes', () => {
  const names = (q: string) => searchIndianDishes(q, list).map((d) => d.id)

  it('finds by any alias, exact alias first', () => {
    expect(names('chapati')[0]).toBe('roti')
    expect(names('dal')[0]).toBe('dal-tadka')
    expect(names('dal')).toContain('dal-makhani')
  })
  it('matches word prefixes, every word', () => {
    expect(names('dal mak')).toEqual(['dal-makhani'])
    expect(names('paneer but')).toEqual(['paneer-butter-masala'])
  })
  it('ignores case and punctuation; empty finds nothing', () => {
    expect(names('IDLI!')).toEqual(['idli'])
    expect(names('  ')).toEqual([])
    expect(names('pizza')).toEqual([])
  })
})
