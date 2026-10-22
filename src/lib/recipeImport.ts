// Recipe import: the pure parts, shared by the Vercel function (api/recipe-import.ts) and unit-tested.
// Most recipe sites describe the recipe in schema.org JSON-LD for search engines; that's what is read here.

export interface ImportedRecipe { name: string; ingredients: string[]; portions: number | null }

type Json = string | number | boolean | null | Json[] | { [k: string]: Json }

const isRecipe = (o: { [k: string]: Json }) => {
  const t = o['@type']
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))
}

/** Find the first schema.org Recipe in parsed JSON-LD (top level, in an array, or in @graph). */
function findRecipe(node: Json, depth = 0): { [k: string]: Json } | null {
  if (!node || typeof node !== 'object' || depth > 6) return null
  if (Array.isArray(node)) {
    for (const n of node) { const r = findRecipe(n, depth + 1); if (r) return r }
    return null
  }
  if (isRecipe(node)) return node
  return findRecipe(node['@graph'] ?? null, depth + 1)
}

const decode = (s: string) => s
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
  .replace(/\s+/g, ' ').trim()

/** "4 servings", "Serves 6", ["4", "4 portions"], 8 → 4 / 6 / 4 / 8; null when there's no number in it. */
export function parseYield(y: Json | undefined): number | null {
  const first = Array.isArray(y) ? y[0] : y
  const n = typeof first === 'number' ? first : typeof first === 'string' ? Number(first.match(/\d+/)?.[0]) : NaN
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null
}

/** The recipe in a page's JSON-LD, or null when the page doesn't describe one. */
export function extractRecipe(html: string): ImportedRecipe | null {
  const blocks = html.matchAll(/<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)
  for (const [, body] of blocks) {
    let data: Json
    try { data = JSON.parse(body.trim()) as Json } catch { continue }
    const r = findRecipe(data)
    if (!r) continue
    const raw = r.recipeIngredient ?? r.ingredients
    const ingredients = (Array.isArray(raw) ? raw : [])
      .filter((x): x is string => typeof x === 'string').map(decode).filter(Boolean).slice(0, 60)
    const name = typeof r.name === 'string' ? decode(r.name).slice(0, 120) : ''
    if (!name && !ingredients.length) continue
    return { name: name || 'Imported recipe', ingredients, portions: parseYield(r.recipeYield) }
  }
  return null
}

/**
 * True for an address on the public internet. The import function refuses everything else (private networks,
 * loopback, link-local such as cloud metadata, carrier-grade NAT, multicast…) so it can't be pointed inward.
 */
export function isPublicAddress(ip: string): boolean {
  const v4 = ip.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/i)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return false
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)))
  }
  const v6 = ip.toLowerCase()
  if (!v6.includes(':')) return false
  return !(v6 === '::' || v6 === '::1' || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6) || v6.startsWith('::ffff:') || v6.startsWith('64:ff9b:') || v6.startsWith('2001:db8'))
}

// words that describe an ingredient's prep or size, not what it is
const DESCRIPTORS = /\b(small|medium|large|big|heaped|heaping|level|fresh|freshly|finely|roughly|chopped|minced|sliced|diced|grated|crushed|ground|boiled|cooked|raw|rinsed|soaked|washed|peeled|deseeded|optional|about|approx(?:imately)?)\b/gi

/**
 * One ingredient line as the quick-add parser reads it: "1½ to 2 tablespoon oil" → "1½ tablespoon oil",
 * "1 cup (200 grams) toor dal ((rinsed))" → "1 cup toor dal", "2 tomatoes, chopped" → "2 tomatoes", "salt to taste" → "salt".
 */
export function ingredientLine(raw: string): string {
  let s = raw
  for (let i = 0; i < 3; i++) s = s.replace(/\([^()]*\)/g, ' ') // brackets, nested ones too
  s = s.split(/[,;]/)[0]
  s = s.replace(/\b(to taste|as needed|as required|for garnish(?:ing)?|or more|if needed)\b/gi, ' ')
  // a range keeps its first number: "1½ to 2", "2-3"
  s = s.replace(/([\d½¼¾⅓⅔⅛./]+)\s*(?:to|-|–|or)\s*[\d½¼¾⅓⅔⅛./]+/gi, '$1')
  return s.replace(DESCRIPTORS, ' ').replace(/\s+/g, ' ').trim()
}
