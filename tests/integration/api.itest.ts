// Runs the app's real data layer against real migrations through PostgREST.
// Start with:  npm run test:int
import { createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { beforeAll, describe, expect, it, vi } from 'vitest'

const env = vi.hoisted(() => ({ jwt: '' }))

vi.mock('@/lib/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js')
  return {
    supabaseConfigured: true,
    // accessToken lets the test act as different users without a GoTrue server.
    supabase: createClient(process.env.TROPHE_INT_URL!, 'anon-key-unused', { db: { schema: 'trophe' }, accessToken: async () => env.jwt }),
  }
})

import * as settings from '@/api/settings'
import * as foods from '@/api/foods'
import * as diary from '@/api/diary'
import * as goals from '@/api/goals'
import * as templates from '@/api/templates'
import { logQuickLine } from '@/api/quickLine'
import * as recipes from '@/api/recipes'
import type { QuickCandidate } from '@/hooks/useQuickLine'
import { resolveAmount } from '@/lib/amount'
import dishes from '@/data/indian-dishes.json'
import type { IndianDish } from '@/lib/indian'
import { parseQuickLog } from '@/lib/quickLog'
import { scale } from '@/lib/nutrition'

const A = 'aaaaaaaa-0000-0000-0000-00000000000a'
const B = 'bbbbbbbb-0000-0000-0000-00000000000b'

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
function jwtFor(sub: string, role = 'authenticated') {
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64({ sub, role, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })
  const sig = createHmac('sha256', process.env.TROPHE_INT_JWT_SECRET!).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}
const as = (u: string) => { env.jwt = jwtFor(u) }
const psql = (sql: string) => {
  const [host, port] = process.env.TROPHE_INT_PG!.split(':')
  return execFileSync('psql', ['-h', host, '-p', port, '-U', 'postgres', '-d', 'postgres', '-Atc', sql]).toString().trim()
}

beforeAll(() => {
  psql(`insert into auth.users(id,email) values ('${A}','a@int'),('${B}','b@int') on conflict do nothing`)
})

describe('settings through PostgREST', () => {
  it('a new user has no row until the first save, which creates it', async () => {
    as(A)
    expect(await settings.fetchSettings()).toBeNull()
    const s = await settings.saveSettings({ timezone: 'Asia/Kolkata' })
    expect(s).toMatchObject({ user_id: A, timezone: 'Asia/Kolkata', theme: 'jade' })
  })

  it('later saves update the same row', async () => {
    as(A)
    await settings.saveSettings({ theme: 'ember' })
    expect(await settings.fetchSettings()).toMatchObject({ timezone: 'Asia/Kolkata', theme: 'ember' })
    expect(psql(`select count(*) from trophe.settings where user_id = '${A}'`)).toBe('1')
  })

  it('each user only ever sees their own settings', async () => {
    as(B)
    expect(await settings.fetchSettings()).toBeNull()
    await settings.saveSettings({ theme: 'sand' })
    expect((await settings.fetchSettings())?.theme).toBe('sand')
    as(A)
    expect((await settings.fetchSettings())?.theme).toBe('ember')
  })

  it('bad values come back as permanent errors with a Postgres code', async () => {
    as(A)
    await expect(settings.saveSettings({ timezone: 'Mars/Olympus' })).rejects.toMatchObject({ name: 'SaveError' })
    await expect(settings.saveSettings({ theme: 'NOT A THEME' as never })).rejects.toMatchObject({ code: '23514' })
  })

  it('anonymous requests are refused', async () => {
    env.jwt = ''
    await expect(settings.fetchSettings()).rejects.toBeTruthy()
  })
})

describe('diary through PostgREST (Phase 1)', () => {
  const day = '2026-10-21'

  it('create a food with servings, log 2 roti, and the stored numbers match the client preview', async () => {
    as(A)
    const f = await foods.createFood({ name: 'Chapati', brand: null, kcal: 297, protein_g: 11, carbs_g: 46, fat_g: 7.5, fiber_g: 9, sugar_g: null, sodium_mg: null, barcode: null })
    const sv = await foods.saveServings(f.id, [{ label: '1 roti', grams: 40 }])
    const amount = resolveAmount({ unit: sv[0].id, qty: 2 }, sv)!
    const e = await diary.logFood({ day, meal: 'lunch', food_id: f.id, ...amount })
    expect(e).toMatchObject({ name: 'Chapati', grams: 80, serving_label: '1 roti', serving_qty: 2 })
    expect({ kcal: e.kcal, protein_g: e.protein_g, carbs_g: e.carbs_g, fat_g: e.fat_g }).toEqual({ kcal: 237.6, protein_g: 8.8, carbs_g: 36.8, fat_g: 6 })
    expect(scale(f, 80).kcal).toBe(e.kcal)
  })

  it('quick add, edit grams, totals in day_summary, recent foods remember the amount', async () => {
    as(A)
    await diary.logQuick({ day, meal: 'snacks', name: '', kcal: 150, protein_g: 3, carbs_g: 20, fat_g: 6 })
    const entries = await diary.fetchDayEntries(day)
    expect(entries.map((e) => e.name).sort()).toEqual(['Chapati', 'Quick add'])
    const roti = entries.find((e) => e.name === 'Chapati')!
    const edited = await diary.updateEntry(roti.id, { grams: 40, serving_qty: 1 })
    expect(edited.kcal).toBe(118.8)
    const s = await diary.daySummary(day)
    expect(s.totals).toMatchObject({ kcal: 268.8, entries: 2 })
    expect(s.meals.lunch.kcal).toBe(118.8)
    const recent = await foods.recentFoods('lunch')
    expect(recent[0]).toMatchObject({ name: 'Chapati', last_grams: 40, last_serving_qty: 1 })
  })

  it('goals by date, range verdicts, copy a meal, saved meals', async () => {
    as(A)
    await goals.saveGoal({ effective_from: '2026-10-01', kcal: 2000, protein_g: 120, carbs_g: 230, fat_g: 65, fiber_g: 28 })
    // saving again on the same start day replaces it
    await goals.saveGoal({ effective_from: '2026-10-01', kcal: 2000, protein_g: 125, carbs_g: 230, fat_g: 65, fiber_g: 28 })
    expect((await goals.goalFor(day))?.protein_g).toBe(125)
    const range = await diary.rangeSummary('2026-10-20', '2026-10-22')
    expect(range.map((r) => r.status)).toEqual(['empty', 'under', 'empty'])
    expect(await diary.copyEntries(day, '2026-10-22', 'lunch', 'dinner')).toBe(1)
    const tpl = await templates.saveMealAsTemplate('Usual lunch', day, 'lunch')
    expect((await templates.listTemplates()).find((t) => t.id === tpl)?.meal_template_items[0].foods?.name).toBe('Chapati')
    expect(await templates.logTemplate(tpl, '2026-10-23', 'lunch')).toBe(1)
    await goals.saveWeighIn(day, 72.4)
    expect(await goals.latestWeighIn()).toEqual({ day, kg: 72.4 })
  })

  it('search finds own foods only; deleting a food keeps the diary', async () => {
    as(B)
    expect(await foods.searchFoods('chapati')).toEqual([])
    expect(await diary.fetchDayEntries(day)).toEqual([])
    as(A)
    const [f] = await foods.searchFoods('CHAP')
    await foods.deleteFood(f.id)
    const after = await diary.fetchDayEntries(day)
    expect(after.find((e) => e.name === 'Chapati')).toMatchObject({ food_id: null, kcal: 118.8 })
  })

  it('a rule broken in the database comes back with its own wording', async () => {
    as(A)
    await expect(templates.saveMealAsTemplate('Empty', '2030-01-01', 'lunch')).rejects.toMatchObject({ code: 'P0001', message: expect.stringContaining('Nothing to save') })
  })
})

describe('quick add by typing', () => {
  // the same candidate list useQuickLine builds: your foods, then the bundled dishes you haven't saved
  const candidates = async (): Promise<QuickCandidate[]> => {
    const mine = await foods.quickLogFoods()
    const saved = new Set(mine.map((f) => f.external_id))
    return [
      ...mine.map((f): QuickCandidate => ({ ...f, tier: 0, ref: { kind: 'mine', id: f.id } })),
      ...(dishes as IndianDish[]).filter((d) => !saved.has(d.id)).map((d): QuickCandidate => ({ ...d, tier: 1, ref: { kind: 'dish', dish: d } })),
    ]
  }

  it('logs a typed line in one go, copying bundled dishes into your foods once', async () => {
    as(A)
    const oats = await foods.createFood({ name: 'Oats', brand: null, barcode: null, kcal: 380, protein_g: 13, carbs_g: 66, fat_g: 7, fiber_g: 10, sugar_g: null, sodium_mg: null })
    await foods.saveServings(oats.id, [{ label: '1 cup', grams: 40 }])

    const line = parseQuickLog('2 cups oats, 3 idli breakfast', await candidates(), '2026-10-24')
    const entries = await logQuickLine(line.items, '2026-10-24', line.meal!)
    expect(entries.map((e) => [e.meal, e.name, e.grams, e.serving_label, e.serving_qty, e.kcal])).toEqual([
      ['breakfast', 'Oats', 80, '1 cup', 2, 304],
      ['breakfast', 'Idli', 120, '1 idli', 3, 162],
    ])

    // the dish is now one of yours, with its servings and what you had
    const mine = await foods.quickLogFoods()
    expect(mine.find((f) => f.external_id === 'idli')).toMatchObject({ name: 'Idli', source: 'ifct', uses: 1, servings: [{ label: '1 idli', grams: 40 }], last: { grams: 120, serving_qty: 3 } })
    expect(mine.find((f) => f.name === 'Oats')).toMatchObject({ uses: 1, last: { grams: 80, serving_label: '1 cup' } })

    // logging it again uses your copy instead of making another
    const again = parseQuickLog('idli', await candidates(), '2026-10-24')
    expect(again.items[0].food?.ref.kind).toBe('mine')
    await logQuickLine(again.items, '2026-10-24', 'dinner')
    expect((await foods.searchFoods('idli')).length).toBe(1)

    as(B)
    expect(await foods.quickLogFoods()).toEqual([])
  })
})

describe('recipes', () => {
  it('saves a recipe from ingredients, reads them back with their foods, logs it by the portion', async () => {
    as(A)
    const rice = await foods.createFood({ name: 'Rice raw', brand: null, barcode: null, kcal: 360, protein_g: 7, carbs_g: 79, fat_g: 0.6, fiber_g: 1.3, sugar_g: null, sodium_mg: null })
    const ghee = await foods.createFood({ name: 'Ghee', brand: null, barcode: null, kcal: 900, protein_g: 0, carbs_g: 0, fat_g: 100, fiber_g: null, sugar_g: null, sodium_mg: null })
    await foods.saveServings(ghee.id, [{ label: '1 tbsp', grams: 14 }])
    const id = await recipes.saveRecipe(null, {
      name: 'Ghee rice', cooked_g: 600, portions: 3,
      items: [{ food_id: rice.id, grams: 200, serving_label: null, serving_qty: null }, { food_id: ghee.id, grams: 28, serving_label: '1 tbsp', serving_qty: 2 }],
    })
    const r = await foods.fetchFood(id)
    expect(r).toMatchObject({ name: 'Ghee rice', source: 'recipe', kcal: 162, recipe_cooked_g: 600, recipe_portions: 3 })
    const items = await recipes.fetchRecipeItems(id)
    expect(items.map((i) => [i.food.name, i.grams, i.serving_label])).toEqual([['Rice raw', 200, null], ['Ghee', 28, '1 tbsp']])
    expect(items[1].food.food_servings.map((s) => s.label)).toEqual(['1 tbsp'])
    expect(await foods.fetchServings(id)).toMatchObject([{ label: '1 portion', grams: 200 }])
    const e = await diary.logFood({ day: '2026-10-25', meal: 'dinner', food_id: id, grams: 200, serving_label: '1 portion', serving_qty: 1 })
    expect(e.kcal).toBe(324)
    await expect(recipes.saveRecipe(null, { name: 'Loop', cooked_g: null, portions: null, items: [{ food_id: id, grams: 10, serving_label: null, serving_qty: null }] }))
      .rejects.toMatchObject({ message: expect.stringContaining("can't be an ingredient") })
    as(B)
    expect(await recipes.fetchRecipeItems(id)).toEqual([])
  })
})
