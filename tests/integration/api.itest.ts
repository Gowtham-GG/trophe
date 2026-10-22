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
import { resolveAmount } from '@/lib/amount'
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
