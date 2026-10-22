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
