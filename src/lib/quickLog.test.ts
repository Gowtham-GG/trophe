import { describe, expect, it } from 'vitest'
import dishes from '@/data/indian-dishes.json'
import type { IndianDish } from './indian'
import { looksLikeQuickLog, parseQuickLog, type QFood } from './quickLog'

type F = QFood & { id: string }
const TODAY = '2026-10-22' // a Thursday

const mine: F[] = [
  { id: 'chapati', name: 'Chapati (homemade)', servings: [{ label: '1 roti', grams: 35 }], last: { grams: 70, serving_label: '1 roti', serving_qty: 2 } },
  { id: 'paneer', name: 'Paneer', brand: 'Amul', servings: [] },
  { id: 'oats', name: 'Oats', servings: [{ label: '1 cup', grams: 40 }], last: { grams: 60, serving_label: null, serving_qty: null } },
  { id: 'toor', name: 'Toor dal', servings: [{ label: '1 katori', grams: 160 }] },
  { id: 'mac', name: 'Mac and cheese', servings: [] },
]
const suggested: F[] = (dishes as IndianDish[]).map((d) => ({ ...d, id: `ifct:${d.id}`, tier: 1 }))
const foods = [...mine, ...suggested]

const parse = (s: string) => parseQuickLog(s, foods, TODAY)
const brief = (s: string) => parse(s).items.map((i) => i.food ? `${i.food.id} ${i.grams}g${i.serving_label ? ` (${i.serving_qty} × ${i.serving_label})` : ''}` : `? ${i.query}`)

describe('parseQuickLog', () => {
  it('reads foods, amounts, the meal and the day', () => {
    const r = parse('2 roti dal lunch')
    expect(r.meal).toBe('lunch')
    expect(r.day).toBeNull()
    expect(brief('2 roti dal lunch')).toEqual(['chapati 70g (2 × 1 roti)', 'ifct:dal-tadka 150g (1 × 1 katori)'])
  })

  it('prefers your food over a bundled dish on an equally good match, but an exact name beats a partial one', () => {
    // "roti" is your Chapati's serving word and the dish's alias: yours wins
    expect(brief('roti')[0]).toMatch(/^chapati/)
    // "dal" exactly names the bundled Dal; your "Toor dal" only contains the word
    expect(brief('dal')[0]).toMatch(/^ifct:dal-tadka/)
    expect(brief('toor dal')[0]).toMatch(/^toor/)
    expect(brief('idli')[0]).toMatch(/^ifct:idli 40g/)
  })

  it('takes grams and ml, with or without a space, before or after the food', () => {
    expect(brief('150g paneer')).toEqual(['paneer 150g'])
    expect(brief('paneer 150 g')).toEqual(['paneer 150g'])
    expect(brief('200ml milk')).toEqual(['ifct:milk 200g'])
    expect(brief('1.5kg rice')).toEqual(['ifct:rice 1500g'])
    expect(brief('8 oz paneer')).toEqual(['paneer 226.8g'])
    expect(parseQuickLog('2 tomatoes', [{ name: 'Tomato', servings: [] }], TODAY).items[0].food?.name).toBe('Tomato')
    expect(brief('⅓ cup oats')).toEqual(['oats 13.2g (0.33 × 1 cup)'])
  })

  it('understands fractions and number words', () => {
    expect(brief('half katori rice')).toEqual(['ifct:rice 75g (0.5 × 1 katori)'])
    expect(brief('1 1/2 roti')).toEqual(['chapati 52.5g (1.5 × 1 roti)'])
    expect(brief('one and a half dosa')).toEqual(['ifct:dosa 135g (1.5 × 1 dosa)'])
    expect(brief('½ plate biryani')).toEqual(['ifct:chicken-biryani 175g (0.5 × 1 plate)'])
    expect(brief('two idlis')).toEqual(['ifct:idli 80g (2 × 1 idli)'])
    expect(brief('2x samosa')).toEqual(['ifct:samosa 150g (2 × 1 samosa)'])
  })

  it('uses the food’s serving for a household measure, else a typical one', () => {
    expect(brief('1 katori toor dal')).toEqual(['toor 160g (1 × 1 katori)'])
    expect(brief('2 cups oats')).toEqual(['oats 80g (2 × 1 cup)'])
    const [i] = parse('1 bowl paneer').items
    expect([i.grams, i.serving_label, i.basis]).toEqual([200, '1 bowl', 'measure'])
    expect(brief('a glass of buttermilk')).toEqual(['ifct:buttermilk 250g (1 × 1 glass)'])
    expect(brief('2 pieces samosa')).toEqual(['ifct:samosa 150g (2 × 1 samosa)'])
  })

  it('without an amount: last time, else one serving, else 100 g', () => {
    expect(parse('oats').items[0]).toMatchObject({ grams: 60, basis: 'last' })
    expect(parse('idli').items[0]).toMatchObject({ grams: 40, serving_label: '1 idli', serving_qty: 1, basis: 'serving' })
    expect(parse('paneer').items[0]).toMatchObject({ grams: 100, basis: 'default' })
    // a small bare number counts portions of last time when there's no serving; a big one is grams
    expect(parse('2 paneer').items[0]).toMatchObject({ grams: 200, basis: 'default' })
    expect(parse('200 paneer').items[0]).toMatchObject({ grams: 200, basis: 'said' })
  })

  it('splits on commas, "and", "with", "+"', () => {
    expect(brief('dosa with sambar and chutney')).toEqual(['ifct:dosa 90g (1 × 1 dosa)', 'ifct:sambar 150g (1 × 1 katori)', 'ifct:coconut-chutney 15g (1 × 1 tbsp)'])
    expect(brief('3 idli, 1 vada + chai')).toEqual(['ifct:idli 120g (3 × 1 idli)', 'ifct:medu-vada 45g (1 × 1 vada)', 'ifct:chai 150g (1 × 1 cup)'])
    // ... but "and" inside a name stays
    expect(brief('mac and cheese')).toEqual(['mac 100g'])
  })

  it('prefers the longest name', () => {
    expect(brief('masala dosa')).toEqual(['ifct:masala-dosa 200g (1 × 1 dosa)'])
    expect(brief('paneer butter masala')[0]).toMatch(/^ifct:paneer-butter-masala/)
    expect(brief('curd rice')[0]).toMatch(/^ifct:curd-rice/)
    expect(brief('amul paneer 50 g')).toEqual(['paneer 50g'])
  })

  it('returns what it doesn’t know, with the words to search for', () => {
    const r = parse('2 pizza slices, roti')
    expect(r.items.map((i) => [i.text, i.query, i.food?.id ?? null])).toEqual([['2 pizza slice', 'pizza', null], ['roti', '', 'chapati']])
    expect(brief('pizza roti')).toEqual(['? pizza', 'chapati 70g (2 × 1 roti)'])
    // words describing a food after its amount are kept with it
    expect(brief('2 big roti')).toEqual(['chapati 70g (2 × 1 roti)'])
  })

  it('reads the day: yesterday, day before yesterday, last night, a weekday', () => {
    expect(parse('roti yesterday dinner')).toMatchObject({ day: '2026-10-21', meal: 'dinner' })
    expect(parse('roti day before yesterday').day).toBe('2026-10-20')
    expect(parse('biryani last night')).toMatchObject({ day: '2026-10-21', meal: 'dinner' })
    expect(parse('dosa on monday breakfast')).toMatchObject({ day: '2026-10-19', meal: 'breakfast' })
    expect(parse('dosa last thursday').day).toBe('2026-10-15') // a weekday is always a past one
    expect(parse('poha this morning')).toMatchObject({ day: null, meal: 'breakfast' })
    expect(parse('2 roti').meal).toBeNull()
  })

  it('handles empty and junk input', () => {
    expect(parse('').items).toEqual([])
    expect(parse(' , and , ').items).toEqual([])
    expect(parse('0 roti').items[0]).toMatchObject({ food: { id: 'chapati' }, basis: 'last' }) // 0 isn't an amount
  })
})

describe('looksLikeQuickLog', () => {
  it('is true for amounts, lists, meals and days; false for a plain search', () => {
    for (const s of ['2 roti', 'roti, dal', 'rice and dal', 'half katori rice', 'dosa breakfast', 'biryani yesterday', '150g paneer']) expect(looksLikeQuickLog(s), s).toBe(true)
    for (const s of ['paneer', 'dal makhani', 'amul butter']) expect(looksLikeQuickLog(s), s).toBe(false)
  })
})
