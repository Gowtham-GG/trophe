import { useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ruleMessage } from '@/api/errors'
import { fetchServings, searchFoods } from '@/api/foods'
import { importRecipe, saveExternalFood, searchOnline, SOURCE_LABEL, usdaFood } from '@/api/online'
import { fetchRecipeItems, saveRecipe } from '@/api/recipes'
import { useSettings } from '@/contexts/SettingsContext'
import { useDebounced } from '@/hooks/useDebounced'
import { useQuickCandidates } from '@/hooks/useQuickLine'
import { initialAmount, resolveAmount, type AmountState } from '@/lib/amount'
import { todayKey } from '@/lib/dates'
import type { ExternalFood } from '@/lib/external'
import { dishToExternal, loadIndianDishes, searchIndianDishes, type IndianDish } from '@/lib/indian'
import { fmtG, fmtKcal } from '@/lib/nutrition'
import { parseQuickLog } from '@/lib/quickLog'
import { recipeNumbers } from '@/lib/recipe'
import { ingredientLine } from '@/lib/recipeImport'
import type { Food, FoodServing, QuickLogFood, RecipeItem } from '@/types/db'
import { AmountPicker } from './AmountPicker'
import { IconPlus, IconSearch, IconX } from './icons'
import { NutritionLine } from './NutritionLine'

type Ingredient = RecipeItem['food']
type Serving = Pick<FoodServing, 'id' | 'label' | 'grams'>
interface Row { key: string; food: Ingredient; servings: Serving[]; amount: AmountState }

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
const byPosition = <T extends Pick<FoodServing, 'position'>>(s: T[]) => [...s].sort((a, b) => a.position - b.position)

const toRow = (i: RecipeItem): Row => {
  const servings = byPosition(i.food.food_servings)
  return { key: i.id, food: i.food, servings, amount: initialAmount(servings, i) }
}

/**
 * Create or edit a recipe: ingredients (your foods or Indian dishes) with amounts, the cooked weight and how many
 * portions it makes. The numbers update as you type; the database stores them per 100 g, with a "1 portion" serving.
 */
export function RecipeForm({ recipe, onSaved, onCancel }: { recipe?: Food; onSaved: (id: string, name: string) => void; onCancel: () => void }) {
  const items = useQuery({ queryKey: ['recipe', recipe?.id], queryFn: () => fetchRecipeItems(recipe!.id), enabled: !!recipe, staleTime: 0, gcTime: 0 })
  const [rows, setRows] = useState<Row[] | null>(recipe ? null : [])
  // an existing recipe's ingredients arrive once; from then on the form owns them
  if (rows === null && items.data) setRows(items.data.map(toRow))

  const [name, setName] = useState(recipe?.name ?? '')
  const [cooked, setCooked] = useState(recipe?.recipe_cooked_g != null ? String(recipe.recipe_cooked_g) : '')
  const [portions, setPortions] = useState(recipe?.recipe_portions != null ? String(recipe.recipe_portions) : '')
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim(), 200)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const found = useQuery({ queryKey: ['foods', 'search', q], queryFn: () => searchFoods(q, { limit: 8 }), enabled: !!q })
  const dishes = useQuery({ queryKey: ['indian-dishes'], queryFn: loadIndianDishes, staleTime: Infinity, gcTime: Infinity })
  const own = (found.data ?? []).filter((f) => f.source !== 'recipe' && f.id !== recipe?.id)
  const saved = new Set(own.filter((f) => f.source === 'ifct').map((f) => f.external_id))
  const dishHits = q && dishes.data ? searchIndianDishes(q, dishes.data, 4).filter((d) => !saved.has(d.id)) : []

  // online (USDA ingredients, Open Food Facts packets): only when asked, to spare the free APIs
  const [onlineQ, setOnlineQ] = useState('')
  const online = useQuery({ queryKey: ['online', onlineQ.toLowerCase()], queryFn: () => searchOnline(onlineQ), enabled: onlineQ.length >= 3, staleTime: 60 * 60_000, retry: false })

  // import from a web page: matched lines become ingredients, the rest a list to find
  const { timezone } = useSettings()
  const candidates = useQuickCandidates(!recipe)
  const [url, setUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [toAdd, setToAdd] = useState<{ line: string; query: string }[]>([])
  const [finding, setFinding] = useState<string | null>(null)

  const add = async (pick: { food: Food } | { dish: IndianDish } | { online: ExternalFood }) => {
    setAdding(true); setError(null)
    try {
      let food: Ingredient
      if ('food' in pick) food = { ...pick.food, food_servings: [] }
      else if ('dish' in pick) food = { ...dishToExternal(pick.dish), id: await saveExternalFood(dishToExternal(pick.dish)), food_servings: [] }
      else {
        // USDA search results carry no portions; the detail does
        const full = pick.online.source === 'usda' && !pick.online.servings.length ? (await usdaFood(pick.online.external_id).catch(() => null)) ?? pick.online : pick.online
        food = { ...full, id: await saveExternalFood(full), food_servings: [] }
      }
      const servings = await fetchServings(food.id)
      setRows((r) => [...(r ?? []), { key: crypto.randomUUID(), food, servings, amount: initialAmount(servings) }])
      setQuery(''); setOnlineQ('')
      if (finding) { setToAdd((l) => l.filter((x) => x.line !== finding)); setFinding(null) }
    } catch (err) { setError(ruleMessage(err, 'Couldn’t add that ingredient.')) } finally { setAdding(false) }
  }

  const doImport = async () => {
    setImporting(true); setError(null)
    try {
      const r = await importRecipe(url.trim())
      if (!name.trim()) setName(r.name)
      if (r.portions && !portions.trim()) setPortions(String(r.portions))
      // ingredients are raw: match your own foods, not the cooked dishes or other recipes
      const raw = (candidates ?? []).filter((c) => c.ref.kind === 'mine' && c.source !== 'ifct' && c.source !== 'recipe')
      const added: Row[] = [], missing: { line: string; query: string }[] = []
      for (const original of r.ingredients) {
        const line = ingredientLine(original)
        const parsed = line ? parseQuickLog(line, raw, todayKey(timezone)).items : []
        const hit = parsed.find((i) => i.food && i.grams)
        if (hit?.food) {
          // your own foods come straight from quick_log_foods(), servings with their ids
          const c = hit.food as unknown as QuickLogFood
          const servings = c.servings.map((x) => ({ id: x.id, label: x.label, grams: x.grams }))
          const sv = servings.find((x) => x.label === hit.serving_label)
          added.push({
            key: crypto.randomUUID(), servings,
            food: { id: c.id, name: c.name, brand: c.brand ?? null, kcal: c.kcal, protein_g: c.protein_g, carbs_g: c.carbs_g, fat_g: c.fat_g, fiber_g: c.fiber_g ?? null, food_servings: [] },
            amount: sv ? { unit: sv.id, qty: hit.serving_qty ?? 1 } : { unit: 'g', qty: hit.grams! },
          })
        } else if (line) {
          missing.push({ line, query: parsed.find((i) => !i.food)?.query || line.replace(/[\d½¼¾⅓⅔⅛./]+/g, ' ').trim() })
        }
      }
      setRows((rs) => [...(rs ?? []), ...added])
      setToAdd(missing)
      setUrl('')
    } catch (err) { setError((err as Error).message) } finally { setImporting(false) }
  }

  const resolved = (rows ?? []).map((r) => ({ row: r, amount: resolveAmount(r.amount, r.servings) }))
  const valid = resolved.every((x) => x.amount)
  const cookedG = num(cooked), portionN = num(portions)
  const numbers = valid ? recipeNumbers(resolved.map((x) => ({ food: x.row.food, grams: x.amount!.grams })), cookedG, portionN) : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Give the recipe a name.')
    if (!rows?.length) return setError('Add at least one ingredient.')
    if (!valid) return setError('Check the ingredient amounts.')
    if (cookedG != null && !(cookedG > 0)) return setError('The cooked weight should be in grams, more than 0.')
    if (portionN != null && !(Number.isInteger(portionN) && portionN >= 1 && portionN <= 100)) return setError('Portions: a whole number from 1 to 100.')
    if (numbers?.tooDense) return setError('The cooked weight is too low for these ingredients. Weigh everything in the pot after cooking (without the pot).')
    setBusy(true)
    try {
      const id = await saveRecipe(recipe?.id ?? null, {
        name: name.trim(), cooked_g: cookedG, portions: portionN,
        items: resolved.map((x) => ({ food_id: x.row.food.id, ...x.amount! })),
      })
      onSaved(id, name.trim())
    } catch (err) { setError(ruleMessage(err, 'Couldn’t save the recipe.')); setBusy(false) }
  }

  if (rows === null) return <div className="skeleton h-40" />

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      {!recipe && (
        <div className="flex gap-2">
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Import from a recipe page — paste its link" aria-label="Recipe page link"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (url.trim()) void doImport() } }} className="field min-w-0 flex-1" />
          <button type="button" onClick={() => void doImport()} disabled={!url.trim() || importing || !candidates} className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-hover">{importing ? 'Reading…' : 'Import'}</button>
        </div>
      )}
      <label className="block"><span className="mb-1 block text-xs text-muted">Name</span>
        <input autoFocus={!recipe} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunday chicken curry" className="field" maxLength={120} /></label>

      <div>
        <p className="label-caps mb-2">Ingredients{rows.length > 0 && ` · ${rows.length}`}</p>
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="rounded-xl bg-panel px-3 py-2">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.food.name}{r.food.brand && <span className="font-normal text-faint"> · {r.food.brand}</span>}</span>
                <button type="button" onClick={() => setRows(rows.filter((x) => x.key !== r.key))} aria-label={`Remove ${r.food.name}`}
                  className="rounded-lg p-1 text-faint hover:bg-hover hover:text-ink"><IconX size={15} /></button>
              </div>
              <AmountPicker compact servings={r.servings} value={r.amount} onChange={(a) => setRows(rows.map((x) => (x.key === r.key ? { ...x, amount: a } : x)))} />
            </li>
          ))}
        </ul>

        {toAdd.length > 0 && (
          <div className="mt-2 rounded-xl border border-line px-3 py-2">
            <p className="mb-1 text-xs text-muted">From the page, still to add (tap one to find it; water and salt can be skipped):</p>
            <ul className="space-y-0.5">
              {toAdd.map((t) => (
                <li key={t.line} className="flex items-center gap-2 text-sm">
                  <button type="button" onClick={() => { setFinding(t.line); setQuery(t.query); setOnlineQ('') }}
                    className={`min-w-0 flex-1 truncate rounded-lg px-2 py-1 text-left hover:bg-hover ${finding === t.line ? 'bg-accent-soft' : ''}`}>{t.line}</button>
                  <button type="button" onClick={() => setToAdd(toAdd.filter((x) => x.line !== t.line))} aria-label={`Skip ${t.line}`} className="rounded p-1 text-faint hover:text-ink"><IconX size={13} /></button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="relative mt-2">
          <IconSearch size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Add an ingredient — search your foods" aria-label="Add an ingredient"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (own[0]) void add({ food: own[0] }); else if (dishHits[0]) void add({ dish: dishHits[0] }) } }}
            className="field pl-10" />
        </div>
        {q && (
          <ul className="mt-1 max-h-56 overflow-y-auto rounded-xl border border-line p-1">
            {own.map((f) => (
              <li key={f.id}><button type="button" disabled={adding} onClick={() => void add({ food: f })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-hover">
                <IconPlus size={14} className="shrink-0 text-accent" /><span className="truncate">{f.name}{f.brand && <span className="text-faint"> · {f.brand}</span>}</span>
                <span className="ml-auto shrink-0 text-xs text-faint">{fmtKcal(f.kcal)} kcal / 100 g</span></button></li>
            ))}
            {dishHits.map((d) => (
              <li key={d.id}><button type="button" disabled={adding} onClick={() => void add({ dish: d })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-hover">
                <IconPlus size={14} className="shrink-0 text-accent" /><span className="truncate">{d.name} <span className="text-faint">· Indian dishes</span></span>
                <span className="ml-auto shrink-0 text-xs text-faint">{fmtKcal(d.kcal)} kcal / 100 g</span></button></li>
            ))}
            {found.isSuccess && !own.length && !dishHits.length && <li className="px-3 py-2 text-sm text-faint">None of your foods match “{q}”.</li>}
            {q.length >= 3 && onlineQ !== q && (
              <li><button type="button" onClick={() => setOnlineQ(q)} className="w-full rounded-lg px-3 py-2 text-left text-sm text-accent hover:bg-hover">Search online for “{q}” (USDA, Open Food Facts)</button></li>
            )}
            {onlineQ === q && online.isFetching && <li className="skeleton m-1 h-9" />}
            {onlineQ === q && online.isError && <li className="px-3 py-2 text-sm text-danger">{(online.error as Error).message}</li>}
            {onlineQ === q && online.data?.foods.slice(0, 8).map((f) => (
              <li key={`${f.source}:${f.external_id}`}><button type="button" disabled={adding} onClick={() => void add({ online: f })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-hover">
                <IconPlus size={14} className="shrink-0 text-accent" /><span className="truncate">{f.name}{f.brand && <span className="text-faint"> · {f.brand}</span>} <span className="text-faint">· {SOURCE_LABEL[f.source]}</span></span>
                <span className="ml-auto shrink-0 text-xs text-faint">{fmtKcal(f.kcal)} kcal / 100 g</span></button></li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Cooked weight (optional)</span>
          <span className="relative block">
            <input inputMode="decimal" value={cooked} onChange={(e) => setCooked(e.target.value)} placeholder={numbers ? fmtG(numbers.rawG) : ''} className="field pr-8 tabular-nums" />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">g</span>
          </span>
          <span className="mt-1 block text-[11px] text-faint">Everything in the pot after cooking, without the pot. Empty: the raw total.</span>
        </label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Portions (optional)</span>
          <input inputMode="numeric" value={portions} onChange={(e) => setPortions(e.target.value)} placeholder="4" className="field tabular-nums" />
          <span className="mt-1 block text-[11px] text-faint">Adds a “1 portion” serving, so you can log a share of the pot.</span>
        </label>
      </div>

      {numbers && (
        <div className="space-y-1 rounded-2xl bg-panel px-4 py-3 text-sm">
          <p><span className="text-muted">Whole recipe</span> · <NutritionLine n={numbers.total} /> <span className="text-xs text-faint">({fmtG(numbers.rawG)} g raw)</span></p>
          {numbers.portion && <p><span className="text-muted">1 portion ({fmtG(numbers.portion.grams)} g)</span> · <NutritionLine n={numbers.portion} /></p>}
          <p><span className="text-muted">Per 100 g</span> · <NutritionLine n={numbers.per100} /></p>
          {numbers.tooDense && <p className="text-xs text-danger">More than 100 g of nutrients per 100 g: the cooked weight is too low.</p>}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm hover:bg-hover">Cancel</button>
        <button disabled={busy || adding} className="bg-accent rounded-lg px-5 py-2 text-sm font-semibold text-on-accent">{busy ? 'Saving…' : recipe ? 'Save recipe' : 'Create recipe'}</button>
      </div>
    </form>
  )
}
