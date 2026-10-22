// Vercel function: food search across Open Food Facts + USDA FoodData Central, normalised to Trophe's shape.
//   GET /api/food-search?q=paneer        → { foods: ExternalFood[], errors: { source, message }[] }
//   GET /api/food-search?usda=173944     → { food: ExternalFood | null } (USDA detail, with portions as servings)
//   GET /api/food-search?barcode=890…    → { food: ExternalFood | null } (Open Food Facts product by barcode)
// Runs on Vercel (free tier), never on Supabase. Only signed-in Trophe users may call it (their Supabase token is
// checked), so nobody else can spend the USDA key's quota. Results are public data, so the CDN may cache them.
import { barcodeVariants, dedupe, fromOff, fromUsda, normaliseBarcode, type ExternalFood, type OffProduct, type UsdaFood } from '../src/lib/external.js'
import { env, json, signedIn, TIMEOUT_MS } from './_shared.js'

// Open Food Facts asks every client to identify itself.
const USER_AGENT = 'Trophe/0.1 (https://github.com/Gowtham-GG/trophe)'
const OFF_FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity'
// Branded (US packaged) foods are left out: Open Food Facts covers packets, with Indian brands
const USDA_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)']

async function searchOff(q: string): Promise<ExternalFood[]> {
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=15&fields=${OFF_FIELDS}`
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(res.status === 429 ? 'busy, try again in a minute' : `HTTP ${res.status}`)
  const data = (await res.json()) as { hits?: OffProduct[] }
  return (data.hits ?? []).map(fromOff).filter((f): f is ExternalFood => !!f)
}

async function searchUsda(q: string): Promise<ExternalFood[]> {
  // POST: the data types go as a JSON list (in a URL, "Survey (FNDDS)" trips USDA's front server)
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${env('USDA_API_KEY') || 'DEMO_KEY'}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({ query: q, pageSize: 12, dataType: USDA_TYPES }),
  })
  if (!res.ok) throw new Error(res.status === 429 ? 'hourly limit reached (add your own USDA_API_KEY)' : `HTTP ${res.status}`)
  const data = (await res.json()) as { foods?: UsdaFood[] }
  return (data.foods ?? []).map(fromUsda).filter((f): f is ExternalFood => !!f)
}

async function usdaDetail(id: string): Promise<ExternalFood | null> {
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/food/${id}?api_key=${env('USDA_API_KEY') || 'DEMO_KEY'}&format=full`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(res.status === 429 ? 'hourly limit reached' : `HTTP ${res.status}`)
  return fromUsda((await res.json()) as UsdaFood)
}

/** A packet by its barcode. Open Food Facts files most codes as EAN-13, so a UPC-A scan also tries the 13-digit form. */
async function offProduct(code: string): Promise<ExternalFood | null> {
  for (const c of barcodeVariants(code).slice(0, 2)) {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${c}?fields=${OFF_FIELDS}`, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (res.status === 404) continue
    if (!res.ok) throw new Error(res.status === 429 ? 'busy, try again in a minute' : `HTTP ${res.status}`)
    const data = (await res.json()) as { status?: number; product?: OffProduct }
    if (data.status === 1 && data.product) return fromOff({ ...data.product, code: data.product.code || c })
  }
  return null
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams
  if (!(await signedIn(request))) return json({ error: 'Sign in to search.' }, 401)

  const usda = params.get('usda')
  if (usda) {
    if (!/^\d{1,10}$/.test(usda)) return json({ error: 'Bad id.' }, 400)
    try { return json({ food: await usdaDetail(usda) }, 200, true) } catch (e) { return json({ error: `USDA: ${(e as Error).message}` }, 502) }
  }

  const barcode = params.get('barcode')
  if (barcode != null) {
    const code = normaliseBarcode(barcode)
    if (!code) return json({ error: 'That isn’t a valid barcode.' }, 400)
    try {
      const food = await offProduct(code)
      // a product missing today may be added tomorrow: only answers that found one are cached
      return json({ food }, 200, !!food)
    } catch (e) { return json({ error: `Open Food Facts: ${(e as Error).message}` }, 502) }
  }

  const q = (params.get('q') ?? '').replace(/\s+/g, ' ').trim()
  if (q.length < 2 || q.length > 80) return json({ error: 'Search for 2–80 characters.' }, 400)
  const [off, us] = await Promise.allSettled([searchOff(q), searchUsda(q)])
  const errors = [
    ...(off.status === 'rejected' ? [{ source: 'off', message: `Open Food Facts: ${(off.reason as Error).message}` }] : []),
    ...(us.status === 'rejected' ? [{ source: 'usda', message: `USDA: ${(us.reason as Error).message}` }] : []),
  ]
  // interleave so neither source buries the other: raw ingredients and packaged products side by side
  const a = off.status === 'fulfilled' ? off.value : [], b = us.status === 'fulfilled' ? us.value : []
  const mixed: ExternalFood[] = []
  for (let i = 0; i < Math.max(a.length, b.length); i++) { if (b[i]) mixed.push(b[i]); if (a[i]) mixed.push(a[i]) }
  // only cache complete answers, so a temporary outage isn't remembered for a day
  return json({ foods: dedupe(mixed), errors }, 200, errors.length === 0)
}
