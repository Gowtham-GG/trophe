// Shared by the Vercel functions (files starting with _ are not routes). They only answer signed-in Trophe users:
// the caller's Supabase token is checked against /auth/v1/user.

export const TIMEOUT_MS = 6000

export const env = (k: string) => process.env[k] ?? process.env[`VITE_${k}`] ?? ''

export const json = (body: unknown, status = 200, cache = false) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    // a day at the edge, a week stale-while-revalidate: repeated searches never reach the food APIs
    'cache-control': cache ? 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800' : 'no-store',
  },
})

// Verified tokens, per warm instance, so a burst of searches costs one Auth call.
const verified = new Map<string, number>()

export async function signedIn(request: Request): Promise<boolean> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!token) return false
  const until = verified.get(token)
  if (until && until > Date.now()) return true
  const url = env('SUPABASE_URL'), key = env('SUPABASE_ANON_KEY')
  if (!url || !key) return false
  const res = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/user`, { headers: { apikey: key, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null)
  if (!res?.ok) return false
  if (verified.size > 500) verified.clear()
  verified.set(token, Date.now() + 5 * 60_000)
  return true
}
