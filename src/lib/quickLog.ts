// Quick add by typing: "2 roti dal lunch", "150g paneer yesterday dinner, chai", "half katori rice" → a list of
// foods with amounts, plus the meal and day when they're said. It only matches the foods it's given (yours, then the
// bundled Indian dishes); anything else comes back unmatched so the user can search for it. Pure: the caller passes
// the foods (best first) and today's date.
import { addDays } from './dates'
import type { MealId } from './meals'

export interface QServing { label: string; grams: number }
export interface QFood {
  name: string
  brand?: string | null
  /** other names it answers to ("chapati", "phulka" for Roti) */
  aliases?: string[]
  servings: QServing[]
  /** what was had last time, if ever */
  last?: { grams: number; serving_label: string | null; serving_qty: number | null } | null
  /** 0 = yours (the default), 1 = a suggestion such as a bundled dish: on an equally good match, yours wins */
  tier?: number
}

export interface QItem<F extends QFood = QFood> {
  /** the words this item came from, for display ("2 roti") */
  text: string
  /** for an unmatched item: the words to search for ("pizza") */
  query: string
  food: F | null
  grams: number | null
  serving_label: string | null
  serving_qty: number | null
  /**
   * how the amount was chosen, shown in the preview: typed in grams or servings ('said' / 'serving'), as last time,
   * a household measure without a serving of its own ('measure': "1 katori" ≈ 150 g), or a guess ('default': 100 g)
   */
  basis: 'said' | 'serving' | 'last' | 'measure' | 'default' | 'none'
}

export interface QuickLog<F extends QFood = QFood> { day: string | null; meal: MealId | null; items: QItem<F>[] }

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  half: 0.5, quarter: 0.25, couple: 2, dozen: 12,
}
const UNITS: Record<string, number> = {
  g: 1, gm: 1, gms: 1, gram: 1, grams: 1, gr: 1, kg: 1000, ml: 1, l: 1000, litre: 1000, liter: 1000, litres: 1000, liters: 1000,
}
// household measures; grams for one when the food has no serving of that name (null: the food's own unit, e.g. a piece)
const MEASURES: Record<string, number | null> = {
  katori: 150, bowl: 200, plate: 250, cup: 150, glass: 250, tbsp: 15, tsp: 5, spoon: 10, ladle: 60, handful: 30, scoop: 30,
  piece: null, slice: null, packet: null, serving: null,
}
const MEASURE_ALIASES: Record<string, string> = {
  vati: 'katori', katora: 'katori', tablespoon: 'tbsp', teaspoon: 'tsp', spoonful: 'spoon', pc: 'piece', pcs: 'piece', nos: 'piece',
  pack: 'packet', sachet: 'packet', portion: 'serving', tumbler: 'glass', mug: 'cup',
}
const MEAL_WORDS: Record<string, MealId> = {
  breakfast: 'breakfast', bf: 'breakfast', brunch: 'breakfast', morning: 'breakfast', tiffin: 'breakfast',
  lunch: 'lunch', afternoon: 'lunch',
  snack: 'snacks', snacks: 'snacks', evening: 'snacks',
  dinner: 'dinner', supper: 'dinner', night: 'dinner', tonight: 'dinner',
}
// words that separate items ("roti with dal", "rice and sambar")
const SEPARATORS = new Set(['and', 'with', 'plus', 'also', 'then', ','])
const FILLER = new Set(['of', 'for', 'at', 'in', 'on', 'had', 'have', 'ate', 'eaten', 'drank', 'some', 'the', 'my', 'today', 'this', 'about', 'around', 'approx', 'like', 'i'])
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** "rotis" → "roti", "glasses" → "glass", "eggs" → "egg"; short words and "-ss" are left alone. */
const singular = (w: string) => (w.endsWith('sses') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !FILLER.has(w)).map(singular)

function parseNumber(t: string): number | null {
  if (t in NUMBER_WORDS) return NUMBER_WORDS[t]
  const frac = t.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[2]) > 0 && Number(frac[1]) > 0 ? Number(frac[1]) / Number(frac[2]) : null
  return /^\d+(\.\d+)?$|^\.\d+$/.test(t) && Number(t) > 0 && Number(t) <= 5000 ? Number(t) : null
}

const measureOf = (t: string): string | null => {
  const s = singular(t)
  return s in MEASURES ? s : MEASURE_ALIASES[t] ?? MEASURE_ALIASES[s] ?? null
}

/** Pull "yesterday", "day before yesterday", "last night", "(last) monday" out of the tokens; returns the day key. */
function takeDay(tokens: string[], today: string): { day: string | null; meal: MealId | null } {
  let i = tokens.indexOf('yesterday')
  if (i >= 0) {
    if (tokens[i - 1] === 'before' && tokens[i - 2] === 'day') { tokens.splice(i - 2, 3); return { day: addDays(today, -2), meal: null } }
    tokens.splice(i, 1); return { day: addDays(today, -1), meal: null }
  }
  i = tokens.findIndex((t, j) => t === 'last' && tokens[j + 1] === 'night')
  if (i >= 0) { tokens.splice(i, 2); return { day: addDays(today, -1), meal: 'dinner' } }
  i = tokens.findIndex((t) => WEEKDAYS.includes(t))
  if (i >= 0) {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay()
    const back = (dow - WEEKDAYS.indexOf(tokens[i]) + 7) % 7 || 7 // a weekday is always a past one: "monday" on a Monday = a week ago
    const last = tokens[i - 1] === 'last'
    tokens.splice(last ? i - 1 : i, last ? 2 : 1)
    return { day: addDays(today, -back), meal: null }
  }
  return { day: null, meal: null }
}

function takeMeal(tokens: string[]): MealId | null {
  const i = tokens.findIndex((t) => t in MEAL_WORDS)
  if (i < 0) return null
  const meal = MEAL_WORDS[tokens[i]]
  tokens.splice(i, 1)
  return meal
}

type Kind = 'num' | 'unit' | 'measure' | 'sep' | 'word'
interface Indexed<F> { food: F; tier: number; variants: string[]; servings: { s: QServing; w: string }[] }
interface Match<F> { food: F; serving: QServing | null; len: number; cls: number; tier: number; order: number }

/**
 * The best food for the words starting at `from` (up to 5). The name, an alias or "brand name" said in full, or a
 * serving's own word ("roti" finds the food with a "1 roti" serving), is a strong match; the start of a name
 * ("paneer butter" → Paneer butter masala) is next; a word somewhere inside a name is the weakest.
 * Longer spans win ("toor dal" over "dal"), then stronger matches, then your foods over suggestions, then list order.
 */
function matchAt<F extends QFood>(ws: string[], kinds: Kind[], from: number, index: Indexed<F>[]): Match<F> | null {
  let best: Match<F> | null = null
  const better = (a: Match<F>, b: Match<F> | null) => {
    if (!b) return true
    // a loose match never beats a real one, however long
    if ((a.cls > 1) !== (b.cls > 1)) return a.cls > 1
    return a.len !== b.len ? a.len > b.len : a.cls !== b.cls ? a.cls > b.cls : a.tier !== b.tier ? a.tier < b.tier : a.order < b.order
  }
  for (let len = 1; len <= 5 && from + len <= ws.length; len++) {
    if (ws[from + len - 1] === ',') break
    if (kinds[from + len - 1] === 'sep') continue // a span may hold "and" ("mac and cheese") but never ends on it
    const span = ws.slice(from, from + len).join(' ')
    index.forEach((f, order) => {
      let cls = 0
      let serving: QServing | null = null
      if (f.variants.includes(span)) cls = 3
      else if (f.servings.some((x) => x.w === span)) { cls = 3; serving = f.servings.find((x) => x.w === span)!.s }
      else if (f.variants.some((v) => v.startsWith(`${span} `))) cls = 2
      else if (f.variants.some((v) => ` ${v} `.includes(` ${span} `))) cls = 1
      if (!cls) return
      // a measure word only starts a match when it's part of a longer name ("cup noodles")
      if (kinds[from] === 'measure' && len === 1) return
      const m = { food: f.food, serving, len, cls, tier: f.tier, order }
      if (better(m, best)) best = m
    })
  }
  return best
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** How much: said in g/ml > a measure ("1 katori") > N of the serving named or last used (or the first) > last time > one serving > 100 g. */
function amount(food: QFood, qty: number | null, unit: number | null, measure: string | null, servingHit: QServing | null): Pick<QItem, 'grams' | 'serving_label' | 'serving_qty' | 'basis'> {
  const serving = (s: QServing, n: number, basis: QItem['basis'] = 'serving') => ({ grams: r1(s.grams * n), serving_label: s.label, serving_qty: n, basis })
  const grams = (g: number, basis: QItem['basis']) => ({ grams: r1(g), serving_label: null, serving_qty: null, basis })
  if (unit != null && qty != null) return grams(qty * unit, 'said')
  if (measure) {
    const n = qty ?? 1
    const own = food.servings.find((s) => words(s.label).some((w) => measureOf(w) === measure))
    if (own) return serving(own, n)
    const g = MEASURES[measure]
    if (g) return serving({ label: `1 ${measure}`, grams: g }, n, 'measure')
    if (food.servings[0]) return serving(food.servings[0], n) // "2 pieces samosa" = 2 samosas
    return grams(100 * n, 'default')
  }
  if (servingHit && qty != null) return serving(servingHit, qty)
  const lastServing = food.last?.serving_label ? food.servings.find((s) => s.label === food.last!.serving_label) : undefined
  if (qty != null) {
    // a bare number: big ones are grams ("200 curd"), small ones count servings ("2 roti") or portions of last time
    if (qty >= 20) return grams(qty, 'said')
    const s = lastServing ?? food.servings[0]
    if (s) return serving(s, qty)
    if (food.last?.grams) return grams(food.last.grams * qty, 'last')
    return grams(100 * qty, 'default')
  }
  if (food.last) return { grams: food.last.grams, serving_label: food.last.serving_label, serving_qty: food.last.serving_qty, basis: 'last' }
  if (servingHit ?? food.servings[0]) return serving(servingHit ?? food.servings[0], 1)
  return grams(100, 'default')
}

const DAY_OR_MEAL = new RegExp(`\\b(${['yesterday', 'last night', ...WEEKDAYS, ...Object.keys(MEAL_WORDS)].join('|')})\\b`)

/** True when the text reads like quick logging rather than a search: an amount, a list, a meal or a day. */
export function looksLikeQuickLog(input: string): boolean {
  const t = input.toLowerCase()
  return /\d|½|¼|¾/.test(t) || /[,+&;]/.test(t) || /\b(and|with|plus|half|quarter)\b/.test(t) || DAY_OR_MEAL.test(t)
}

export function parseQuickLog<F extends QFood>(input: string, foods: F[], today: string): QuickLog<F> {
  const text = input.toLowerCase()
    .replace(/½/g, ' 0.5 ').replace(/¼/g, ' 0.25 ').replace(/¾/g, ' 0.75 ')
    .replace(/\bhalf an?\b/g, ' 0.5 ')                                     // "half a katori"
    .replace(/\b(\d+|one|two|three|a|an)\s+and\s+a\s+half\b/g, (_, n: string) => ` ${(parseNumber(n) ?? 1) + 0.5} `)
    .replace(/(\d)\s*x\b/g, '$1 ').replace(/\bx\s*(\d)/g, ' $1')           // "2x roti", "roti x2"
    .replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2')     // "150g" → "150 g"
    .replace(/[,+&;\n]/g, ' , ')
  const tokens = text.split(/\s+/).map((t) => t.replace(/[^a-z0-9.,/]/g, '').replace(/^\.+$|\.+$/g, '')).filter((t) => t && !FILLER.has(t))
  const said = takeDay(tokens, today)
  const meal = takeMeal(tokens) ?? said.meal

  const ws: string[] = []
  const kinds: Kind[] = []
  for (const t of tokens) {
    if (SEPARATORS.has(t)) { ws.push(t); kinds.push('sep') }
    else if (parseNumber(t) != null) { ws.push(t); kinds.push('num') }
    else if (/^[\d./]+$/.test(t)) continue // "0", "1/0": not an amount
    else if (t in UNITS) { ws.push(t); kinds.push('unit') }
    else if (measureOf(t)) { ws.push(measureOf(t)!); kinds.push('measure') }
    else { ws.push(singular(t)); kinds.push('word') }
  }

  const index: Indexed<F>[] = foods.map((food) => {
    const name = words(food.name).join(' ')
    const variants = [name, ...(food.aliases ?? []).map((a) => words(a).join(' '))]
    if (food.brand) variants.push(`${words(food.brand).join(' ')} ${name}`)
    // a serving's own word: "1 roti" → "roti", "1 omelette (2 eggs)" → "omelette egg" (only the words before a bracket)
    const servings = food.servings.map((s) => ({ s, w: words(s.label.replace(/\(.*$/, '')).filter((w) => !/^\d/.test(w)).join(' ') }))
      .filter((x) => x.w && !measureOf(x.w))
    return { food, tier: food.tier ?? 0, variants: variants.filter(Boolean), servings }
  })

  const items: QItem<F>[] = []
  let qty: number | null = null, unit: number | null = null, measure: string | null = null
  let text_: string[] = []   // the words of the item being read, for display
  let unknown: string[] = [] // words not (yet) matched to a food
  const reset = () => { qty = null; unit = null; measure = null; text_ = []; unknown = [] }
  const flushUnknown = () => {
    if (unknown.length) items.push({ text: text_.join(' '), query: unknown.join(' '), food: null, grams: null, serving_label: null, serving_qty: null, basis: 'none' })
    reset()
  }

  for (let i = 0; i < ws.length;) {
    const kind = kinds[i]
    if (kind === 'word' || kind === 'measure') {
      const m = matchAt(ws, kinds, i, index)
      if (m) {
        // unknown words just before a match describe it when an amount came first ("2 big roti"); otherwise they're
        // a food of their own that isn't known ("pizza roti")
        if (unknown.length && qty == null && unit == null && measure == null) flushUnknown()
        text_.push(...ws.slice(i, i + m.len))
        i += m.len
        // an amount after the food closes the item: "roti 2", "paneer 150 g", "rice 1 katori"
        if (qty == null && kinds[i] === 'num') {
          let j = i + 1
          if (kinds[j] === 'unit' || kinds[j] === 'measure') j++
          if (j >= ws.length || kinds[j] === 'sep') {
            qty = parseNumber(ws[i])
            if (kinds[i + 1] === 'unit') unit = UNITS[ws[i + 1]]
            if (kinds[i + 1] === 'measure') measure = ws[i + 1]
            text_.push(...ws.slice(i, j))
            i = j
          }
        }
        items.push({ text: text_.join(' '), query: '', food: m.food, ...amount(m.food, qty, unit, measure, m.serving) })
        reset()
        continue
      }
      if (kind === 'measure') measure = ws[i]
      else unknown.push(ws[i])
      text_.push(ws[i]); i++; continue
    }
    if (kind === 'sep') { flushUnknown(); i++; continue }
    if (kind === 'num') {
      if (unknown.length) flushUnknown() // "pizza 2 roti": the number starts the next item
      const n = parseNumber(ws[i])!
      qty = qty != null && n < 1 && unit == null && measure == null ? qty + n : n // "1 1/2" → 1.5
      text_.push(ws[i]); i++; continue
    }
    // a unit: "150 g"
    unit = UNITS[ws[i]]
    text_.push(ws[i]); i++
  }
  flushUnknown()
  return { day: said.day, meal, items }
}
