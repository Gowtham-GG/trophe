import { useState, type FormEvent } from 'react'
import { createFood, saveServings, updateFood, type FoodInput } from '@/api/foods'
import { ruleMessage } from '@/api/errors'
import { MICROS, type MicroKey, type Micros } from '@/lib/micros'
import { kcalFromMacros } from '@/lib/nutrition'
import type { Food, FoodServing } from '@/types/db'
import { IconPlus, IconX } from './icons'

type Num = string
const num = (v: Num) => (v.trim() === '' ? null : Number(v.replace(',', '.')))
const str = (n: number | null | undefined, k = 1) => (n == null ? '' : String(Math.round(n * k * 10) / 10))

/**
 * Create or edit a food. Labels often give nutrition per serving, so the numbers can be typed "per 100 g" or
 * "per serving of N g" — they're stored per 100 g either way (and the serving is added to the food).
 */
export function FoodForm({ food, servings = [], initialName = '', barcode, onSaved, onCancel }: {
  food?: Food; servings?: FoodServing[]; initialName?: string; /** a scanned code to save with a new food */ barcode?: string
  onSaved: (f: Food) => void; onCancel?: () => void
}) {
  const [name, setName] = useState(food?.name ?? initialName)
  const [brand, setBrand] = useState(food?.brand ?? '')
  const [basis, setBasis] = useState<'100g' | 'serving'>('100g')
  const [basisLabel, setBasisLabel] = useState('1 serving')
  const [basisGrams, setBasisGrams] = useState('')
  const [v, setV] = useState<Record<string, Num>>({
    kcal: str(food?.kcal), protein_g: str(food?.protein_g), carbs_g: str(food?.carbs_g), fat_g: str(food?.fat_g),
    fiber_g: str(food?.fiber_g), sugar_g: str(food?.sugar_g), sodium_mg: str(food?.sodium_mg),
  })
  const [mv, setMv] = useState<Record<string, Num>>(() => Object.fromEntries(MICROS.map((m) => [m.key, str(food?.micros?.[m.key])])))
  const [rows, setRows] = useState(servings.map((s) => ({ label: s.label, grams: String(s.grams) })))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const factor = basis === 'serving' ? 100 / (num(basisGrams) ?? NaN) : 1
  const per100 = (k: string) => { const n = num(v[k]); return n == null ? null : Math.round(n * factor * 10) / 10 }
  const kcal = per100('kcal')
  const macroKcal = kcalFromMacros(per100('protein_g') ?? 0, per100('carbs_g') ?? 0, per100('fat_g') ?? 0)
  // labels round; only flag a real mismatch (> 20 % and > 20 kcal)
  const mismatch = kcal != null && macroKcal > 0 && Math.abs(kcal - macroKcal) > Math.max(20, kcal * 0.2)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError('Give the food a name.')
    if (basis === 'serving' && !(num(basisGrams)! > 0)) return setError('How many grams is that serving?')
    if (kcal == null || !(kcal >= 0)) return setError('Enter the calories.')
    if (kcal > 950) return setError('That’s more than 950 kcal per 100 g — check the numbers (or the serving size).')
    const input: FoodInput = {
      name: name.trim(), brand: brand.trim() || null, barcode: food?.barcode ?? barcode ?? null,
      kcal, protein_g: per100('protein_g') ?? 0, carbs_g: per100('carbs_g') ?? 0, fat_g: per100('fat_g') ?? 0,
      fiber_g: per100('fiber_g'), sugar_g: per100('sugar_g'), sodium_mg: per100('sodium_mg'),
    }
    const micros: Micros = {}
    for (const m of MICROS) {
      const raw = num(mv[m.key])
      if (raw == null) continue
      if (!(raw >= 0)) return setError(`Check ${m.label.toLowerCase()}.`)
      micros[m.key as MicroKey] = Math.round(raw * factor * 1000) / 1000
    }
    input.micros = Object.keys(micros).length ? micros : null
    if (input.protein_g + input.carbs_g + input.fat_g > 105) return setError('Protein + carbs + fat can’t be more than 100 g per 100 g.')
    const list = rows.map((r) => ({ label: r.label.trim(), grams: num(r.grams) ?? 0 })).filter((r) => r.label && r.grams > 0)
    if (basis === 'serving' && basisLabel.trim() && !list.some((r) => r.label === basisLabel.trim())) list.unshift({ label: basisLabel.trim(), grams: num(basisGrams)! })
    setBusy(true)
    try {
      const saved = food ? await updateFood(food.id, input) : await createFood(input)
      await saveServings(saved.id, list)
      onSaved(saved)
    } catch (err) { setError(ruleMessage(err, 'Couldn’t save the food. Check the numbers and try again.')) } finally { setBusy(false) }
  }

  const field = (k: string, label: string, unit = 'g') => (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <span className="relative block">
        <input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="field pr-10 tabular-nums" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">{unit}</span>
      </span>
    </label>
  )

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-xs text-muted">Name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chapati" className="field" maxLength={120} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Brand (optional)</span>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Homemade, Amul…" className="field" maxLength={120} /></label>
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Nutrition per</span>
          {(['100g', 'serving'] as const).map((b) => (
            <button key={b} type="button" onClick={() => setBasis(b)} className={`rounded-full px-3 py-1 ${basis === b ? 'bg-accent-soft font-semibold text-accent' : 'bg-panel text-muted hover:bg-hover'}`}>
              {b === '100g' ? '100 g' : 'serving'}
            </button>
          ))}
        </div>
        {basis === 'serving' && (
          <div className="mb-3 grid grid-cols-[1fr_8rem] gap-2">
            <input value={basisLabel} onChange={(e) => setBasisLabel(e.target.value)} aria-label="Serving name" placeholder="1 bar" className="field" maxLength={40} />
            <span className="relative block">
              <input inputMode="decimal" value={basisGrams} onChange={(e) => setBasisGrams(e.target.value)} aria-label="Serving grams" placeholder="40" className="field pr-8 tabular-nums" />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">g</span>
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {field('kcal', 'Calories', 'kcal')}
          {field('protein_g', 'Protein')}
          {field('carbs_g', 'Carbs')}
          {field('fat_g', 'Fat')}
        </div>
        <details className="mt-3">
          <summary className="text-sm text-muted">More nutrients (optional)</summary>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {field('fiber_g', 'Fibre')}
            {field('sugar_g', 'Sugar')}
            {field('sodium_mg', 'Sodium', 'mg')}
          </div>
          <p className="mb-2 mt-4 text-xs text-muted">Vitamins and minerals, as on the label (or leave them empty)</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {MICROS.map((m) => (
              <label key={m.key} className="block">
                <span className="mb-1 block text-xs text-muted">{m.label}</span>
                <span className="relative block">
                  <input inputMode="decimal" value={mv[m.key]} onChange={(e) => setMv({ ...mv, [m.key]: e.target.value })} className="field pr-9 tabular-nums" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">{m.unit}</span>
                </span>
              </label>
            ))}
          </div>
        </details>
        {mismatch && <p className="mt-2 text-xs text-important">Heads up: the macros add up to ~{Math.round(macroKcal)} kcal, not {kcal}. Fine if the label says so.</p>}
      </div>

      <div>
        <p className="label-caps mb-2">Servings</p>
        <p className="mb-2 text-xs text-muted">So you can log “2 roti” instead of grams. Optional.</p>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_auto] gap-2">
              <input value={r.label} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Serving name" placeholder="1 roti" className="field" maxLength={40} />
              <span className="relative block">
                <input inputMode="decimal" value={r.grams} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, grams: e.target.value } : x)))} aria-label="Grams" placeholder="40" className="field pr-8 tabular-nums" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">g</span>
              </span>
              <button type="button" aria-label="Remove serving" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="rounded-lg px-2 text-muted hover:bg-hover hover:text-ink"><IconX size={16} /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setRows([...rows, { label: '', grams: '' }])} className="mt-2 flex items-center gap-1.5 text-sm text-accent"><IconPlus size={15} /> Add a serving</button>
      </div>

      {(food?.barcode ?? barcode) && <p className="text-xs text-faint">Barcode {food?.barcode ?? barcode}{!food && ' is saved with it, so scanning it again finds this food'}.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm hover:bg-hover">Cancel</button>}
        <button disabled={busy} className="bg-accent rounded-lg px-5 py-2 text-sm font-semibold text-on-accent">{busy ? 'Saving…' : food ? 'Save food' : 'Create food'}</button>
      </div>
    </form>
  )
}
