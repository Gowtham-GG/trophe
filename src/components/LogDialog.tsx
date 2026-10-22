import { useRef, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteEntry, logFood, logQuick } from '@/api/diary'
import { ruleMessage } from '@/api/errors'
import { fetchServings, frequentFoods, recentFoods, searchFoods } from '@/api/foods'
import { listTemplates, logTemplate } from '@/api/templates'
import { useSettings } from '@/contexts/SettingsContext'
import { useToast } from '@/contexts/ToastContext'
import { useDebounced } from '@/hooks/useDebounced'
import { initialAmount, resolveAmount, type AmountState } from '@/lib/amount'
import { formatDayHeading } from '@/lib/dates'
import { MEALS } from '@/lib/meals'
import { describeAmount, fmtG, fmtKcal, scale } from '@/lib/nutrition'
import type { Food, SuggestedFood } from '@/types/db'
import { AmountPicker } from './AmountPicker'
import { Dialog } from './Dialog'
import { FoodForm } from './FoodForm'
import { IconBack, IconPlus, IconSearch } from './icons'
import { NutritionLine } from './NutritionLine'

type Picked = { food: Pick<Food, 'id' | 'name' | 'brand' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'> & { fiber_g?: number | null }; last?: SuggestedFood }
type Step = { kind: 'pick' } | { kind: 'amount'; picked: Picked } | { kind: 'new'; name: string } | { kind: 'quick' }

const mealLabel = (id: string) => MEALS.find((m) => m.id === id)?.label ?? id

/** One row in the pick list: name, what you had last time (or kcal / 100 g), and a one-tap re-log. */
function FoodRow({ name, brand, detail, onPick, onRepeat }: { name: string; brand: string | null; detail: React.ReactNode; onPick: () => void; onRepeat?: () => void }) {
  return (
    <li className="flex items-center gap-2 rounded-xl hover:bg-hover">
      <button onClick={onPick} className="min-w-0 flex-1 px-3 py-2.5 text-left">
        <span className="block truncate text-sm font-medium">{name}{brand && <span className="font-normal text-faint"> · {brand}</span>}</span>
        <span className="block truncate text-xs text-muted">{detail}</span>
      </button>
      {onRepeat && (
        <button onClick={onRepeat} aria-label={`Log ${name} again, same amount`} title="Same as last time"
          className="mr-2 flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent hover:opacity-80"><IconPlus size={18} /></button>
      )}
    </li>
  )
}

/**
 * The food logger: search your foods (or pick from recent / most-logged / saved meals), choose an amount, log.
 * It stays open after each item so a whole meal can be logged in one go.
 */
export function LogDialog({ day, meal: initialMeal, onClose }: { day: string; meal: string; onClose: () => void }) {
  const { timezone } = useSettings()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [meal, setMeal] = useState(initialMeal)
  const [step, setStep] = useState<Step>({ kind: 'pick' })
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim(), 200)
  const [added, setAdded] = useState<{ n: number; kcal: number }>({ n: 0, kcal: 0 })
  const searchRef = useRef<HTMLInputElement>(null)

  const results = useQuery({ queryKey: ['foods', 'search', q], queryFn: () => searchFoods(q, { limit: 25 }), enabled: step.kind === 'pick' && !!q })
  const recent = useQuery({ queryKey: ['foods', 'recent', meal], queryFn: () => recentFoods(meal, 8), enabled: step.kind === 'pick' && !q })
  const recentAny = useQuery({ queryKey: ['foods', 'recent', null], queryFn: () => recentFoods(null, 8), enabled: step.kind === 'pick' && !q && recent.data?.length === 0 })
  const frequent = useQuery({ queryKey: ['foods', 'frequent', null], queryFn: () => frequentFoods(null, 8), enabled: step.kind === 'pick' && !q })
  const templates = useQuery({ queryKey: ['templates'], queryFn: listTemplates, enabled: step.kind === 'pick' && !q })

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['diary'] }); void qc.invalidateQueries({ queryKey: ['foods'] }) }
  const back = () => { setStep({ kind: 'pick' }); setTimeout(() => searchRef.current?.focus(), 0) }

  const saved = (name: string, kcal: number, id: string) => {
    refresh()
    setAdded((a) => ({ n: a.n + 1, kcal: a.kcal + kcal }))
    toast(`Logged ${name} · ${fmtKcal(kcal)} kcal`, { action: { label: 'Undo', onClick: () => void deleteEntry(id).then(() => { refresh(); setAdded((a) => ({ n: a.n - 1, kcal: a.kcal - kcal })) }) } })
    setQuery('')
    back()
  }

  const repeat = async (s: SuggestedFood) => {
    try {
      const e = await logFood({ day, meal, food_id: s.id, grams: s.last_grams, serving_label: s.last_serving_label, serving_qty: s.last_serving_qty })
      saved(e.name, e.kcal, e.id)
    } catch (err) { toast(ruleMessage(err, 'Couldn’t log that.'), { kind: 'error' }) }
  }

  const logSavedMeal = async (id: string, name: string) => {
    try {
      const n = await logTemplate(id, day, meal)
      refresh()
      toast(n ? `Logged ${name} (${n} item${n === 1 ? '' : 's'}) to ${mealLabel(meal)}` : `${name} has no foods left to log.`)
      if (n) setAdded((a) => ({ n: a.n + n, kcal: a.kcal }))
    } catch { toast('Couldn’t log that meal.', { kind: 'error' }) }
  }

  const suggestions = (recent.data?.length ? recent.data : recentAny.data) ?? []
  const frequentOnly = (frequent.data ?? []).filter((f) => !suggestions.some((s) => s.id === f.id))
  const lastDetail = (s: SuggestedFood) => {
    const amt = describeAmount({ grams: s.last_grams, serving_label: s.last_serving_label, serving_qty: s.last_serving_qty })
    return `${amt} · ${fmtKcal(scale(s, s.last_grams).kcal)} kcal`
  }

  return (
    <Dialog open onClose={onClose} title="Log food" wide closable>
      {/* where it goes: the meal is a tap away; the day is shown when it isn't today */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 pr-8">
        <span className="label-caps mr-1">Log to</span>
        {MEALS.map((m) => (
          <button key={m.id} onClick={() => setMeal(m.id)} aria-pressed={meal === m.id}
            className={`rounded-full px-3 py-1 text-sm ${meal === m.id ? 'bg-accent text-on-accent font-semibold' : 'bg-panel text-muted hover:bg-hover hover:text-ink'}`}>{m.label}</button>
        ))}
        <span className="ml-1 text-xs text-faint">{formatDayHeading(day, timezone)}</span>
      </div>

      {step.kind === 'pick' && (
        <div>
          <label className="relative block">
            <IconSearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input ref={searchRef} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your foods…" aria-label="Search your foods"
              onKeyDown={(e) => { if (e.key === 'Enter' && results.data?.[0]) { e.preventDefault(); setStep({ kind: 'amount', picked: { food: results.data[0] } }) } }}
              className="field pl-10" />
          </label>

          <div className="mt-3 max-h-[50vh] min-h-40 overflow-y-auto">
            {q ? (
              <>
                {results.isLoading && <div className="skeleton h-12" />}
                <ul>
                  {(results.data ?? []).map((f) => (
                    <FoodRow key={f.id} name={f.name} brand={f.brand} detail={`${fmtKcal(f.kcal)} kcal / 100 g`} onPick={() => setStep({ kind: 'amount', picked: { food: f } })} />
                  ))}
                </ul>
                {results.isSuccess && results.data.length === 0 && <p className="px-3 py-3 text-sm text-faint">None of your foods match “{q}”. Create it below. (Online search arrives in Phase 2.)</p>}
              </>
            ) : (
              <>
                {!!templates.data?.length && (
                  <div className="mb-3">
                    <p className="label-caps mb-1.5 px-1">Saved meals</p>
                    <div className="flex flex-wrap gap-1.5">
                      {templates.data.map((t) => (
                        <button key={t.id} onClick={() => void logSavedMeal(t.id, t.name)} className="rounded-full border border-line px-3 py-1 text-sm hover:bg-hover">{t.name}</button>
                      ))}
                    </div>
                  </div>
                )}
                {!!suggestions.length && (
                  <>
                    <p className="label-caps mb-1 px-1">{recent.data?.length ? `Recent at ${mealLabel(meal).toLowerCase()}` : 'Recent'}</p>
                    <ul className="mb-3">
                      {suggestions.map((s) => <FoodRow key={s.id} name={s.name} brand={s.brand} detail={lastDetail(s)} onPick={() => setStep({ kind: 'amount', picked: { food: s, last: s } })} onRepeat={() => void repeat(s)} />)}
                    </ul>
                  </>
                )}
                {!!frequentOnly.length && (
                  <>
                    <p className="label-caps mb-1 px-1">Most logged</p>
                    <ul>
                      {frequentOnly.map((s) => <FoodRow key={s.id} name={s.name} brand={s.brand} detail={lastDetail(s)} onPick={() => setStep({ kind: 'amount', picked: { food: s, last: s } })} onRepeat={() => void repeat(s)} />)}
                    </ul>
                  </>
                )}
                {recent.isSuccess && frequent.isSuccess && !suggestions.length && !frequentOnly.length && !templates.data?.length && (
                  <p className="px-1 py-3 text-sm text-faint">Nothing logged yet. Search, or create your first food — the ones you log show up here next time.</p>
                )}
              </>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <button onClick={() => setStep({ kind: 'new', name: query.trim() })} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-accent hover:bg-hover"><IconPlus size={16} /> New food{query.trim() && ` “${query.trim()}”`}</button>
            <button onClick={() => setStep({ kind: 'quick' })} className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-hover hover:text-ink">Quick add calories</button>
            <span className="flex-1" />
            {added.n > 0 && <span className="text-xs text-muted tabular-nums">{added.n} added{added.kcal > 0 && ` · ${fmtKcal(added.kcal)} kcal`}</span>}
            <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-hover">Done</button>
          </div>
        </div>
      )}

      {step.kind === 'amount' && <AmountStep picked={step.picked} meal={meal} day={day} onBack={back} onLogged={saved} />}

      {step.kind === 'new' && (
        <div>
          <StepHeader title="New food" onBack={back} />
          <FoodForm initialName={step.name} onCancel={back} onSaved={(f) => { void qc.invalidateQueries({ queryKey: ['foods'] }); setStep({ kind: 'amount', picked: { food: f } }) }} />
        </div>
      )}

      {step.kind === 'quick' && <QuickStep meal={meal} day={day} onBack={back} onLogged={saved} />}
    </Dialog>
  )
}

function StepHeader({ title, sub, onBack }: { title: string; sub?: string | null; onBack: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <button onClick={onBack} aria-label="Back" className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink"><IconBack size={18} /></button>
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold">{title}</h2>
        {sub && <p className="truncate text-xs text-faint">{sub}</p>}
      </div>
    </div>
  )
}

/** Pick how much, see the numbers update live, log. */
function AmountStep({ picked, meal, day, onBack, onLogged }: { picked: Picked; meal: string; day: string; onBack: () => void; onLogged: (name: string, kcal: number, id: string) => void }) {
  const { toast } = useToast()
  const servings = useQuery({ queryKey: ['foods', 'servings', picked.food.id], queryFn: () => fetchServings(picked.food.id) })
  const [chosen, setAmount] = useState<AmountState | null>(null)
  const [busy, setBusy] = useState(false)

  // until the user changes it: last time's amount (or the first serving), once the servings are known
  const l = picked.last
  const amount = chosen ?? (servings.data ? initialAmount(servings.data, l ? { grams: l.last_grams, serving_label: l.last_serving_label, serving_qty: l.last_serving_qty } : null) : null)

  const resolved = amount && servings.data ? resolveAmount(amount, servings.data) : null
  const preview = resolved ? scale(picked.food, resolved.grams) : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!resolved || busy) return
    setBusy(true)
    try {
      const entry = await logFood({ day, meal, food_id: picked.food.id, ...resolved })
      onLogged(entry.name, entry.kcal, entry.id)
    } catch (err) { toast(ruleMessage(err, 'Couldn’t log that.'), { kind: 'error' }); setBusy(false) }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <StepHeader title={picked.food.name} sub={picked.food.brand} onBack={onBack} />
      {!amount || !servings.data ? <div className="skeleton h-12" /> : <AmountPicker servings={servings.data} value={amount} onChange={setAmount} autoFocus />}
      <div className="mt-4 rounded-2xl bg-panel px-4 py-3 text-sm">
        {preview ? <NutritionLine n={preview} /> : <span className="text-faint">Enter an amount</span>}
        {resolved && <span className="ml-2 text-xs text-faint">({fmtG(resolved.grams)} g)</span>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onBack} className="rounded-lg px-4 py-2 text-sm hover:bg-hover">Back</button>
        <button disabled={!resolved || busy} className="bg-accent rounded-lg px-5 py-2 text-sm font-semibold text-on-accent">
          {busy ? 'Logging…' : `Log${preview ? ` ${fmtKcal(preview.kcal)} kcal` : ''} to ${mealLabel(meal)}`}
        </button>
      </div>
    </form>
  )
}

/** Calories typed directly: for a restaurant meal or anything without a food to look up. */
function QuickStep({ meal, day, onBack, onLogged }: { meal: string; day: string; onBack: () => void; onLogged: (name: string, kcal: number, id: string) => void }) {
  const { toast } = useToast()
  const [v, setV] = useState({ name: '', kcal: '', protein_g: '', carbs_g: '', fat_g: '' })
  const [busy, setBusy] = useState(false)
  const n = (s: string) => (s.trim() ? Number(s.replace(',', '.')) : 0)
  const valid = n(v.kcal) > 0 && [v.kcal, v.protein_g, v.carbs_g, v.fat_g].every((s) => Number.isFinite(n(s)) && n(s) >= 0)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    try {
      const entry = await logQuick({ day, meal, name: v.name.trim(), kcal: n(v.kcal), protein_g: n(v.protein_g), carbs_g: n(v.carbs_g), fat_g: n(v.fat_g) })
      onLogged(entry.name, entry.kcal, entry.id)
    } catch (err) { toast(ruleMessage(err, 'Couldn’t log that.'), { kind: 'error' }); setBusy(false) }
  }

  const box = (k: keyof typeof v, label: string, unit: string) => (
    <label className="block"><span className="mb-1 block text-xs text-muted">{label}</span>
      <span className="relative block">
        <input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="field pr-11 tabular-nums" autoFocus={k === 'kcal'} />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">{unit}</span>
      </span>
    </label>
  )

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <StepHeader title="Quick add" sub="Calories without a food — e.g. a restaurant meal" onBack={onBack} />
      <label className="block"><span className="mb-1 block text-xs text-muted">What was it? (optional)</span>
        <input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Wedding lunch" className="field" maxLength={160} /></label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {box('kcal', 'Calories', 'kcal')}{box('protein_g', 'Protein', 'g')}{box('carbs_g', 'Carbs', 'g')}{box('fat_g', 'Fat', 'g')}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onBack} className="rounded-lg px-4 py-2 text-sm hover:bg-hover">Back</button>
        <button disabled={!valid || busy} className="bg-accent rounded-lg px-5 py-2 text-sm font-semibold text-on-accent">{busy ? 'Logging…' : `Log to ${mealLabel(meal)}`}</button>
      </div>
    </form>
  )
}
