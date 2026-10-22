import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteEntry, restoreEntry, updateEntry, type EntryPatch } from '@/api/diary'
import { ruleMessage } from '@/api/errors'
import { fetchServings } from '@/api/foods'
import { useToast } from '@/contexts/ToastContext'
import { initialAmount, resolveAmount, type AmountState } from '@/lib/amount'
import { MEALS } from '@/lib/meals'
import { fmtG, scale } from '@/lib/nutrition'
import type { DiaryEntry } from '@/types/db'
import { AmountPicker } from './AmountPicker'
import { Dialog } from './Dialog'
import { NutritionLine } from './NutritionLine'

/**
 * Edit one logged item: amount and meal (or, for a quick add, its numbers), or delete it (with Undo).
 * The preview scales the entry's OWN copy of the nutrients, exactly like the database does on save.
 */
export function EntryDialog({ entry, onClose }: { entry: DiaryEntry; onClose: () => void }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const isFood = entry.grams != null
  const servings = useQuery({ queryKey: ['foods', 'servings', entry.food_id], queryFn: () => fetchServings(entry.food_id!), enabled: !!entry.food_id })
  const list = servings.data ?? []
  const [chosen, setAmount] = useState<AmountState | null>(null)
  const [meal, setMeal] = useState(entry.meal)
  const [quick, setQuick] = useState({ name: entry.name, kcal: String(entry.kcal), protein_g: String(entry.protein_g), carbs_g: String(entry.carbs_g), fat_g: String(entry.fat_g) })
  const [busy, setBusy] = useState(false)

  // until the user changes it: the amount as logged (its serving, if the food still has it)
  const ready = !entry.food_id || servings.isFetched
  const amount = chosen ?? (isFood && ready ? initialAmount(list, entry) : null)

  // the entry's own per-100 g, derived from its copy (the food may have changed or be gone)
  const per100 = isFood ? { kcal: (entry.kcal / entry.grams!) * 100, protein_g: (entry.protein_g / entry.grams!) * 100, carbs_g: (entry.carbs_g / entry.grams!) * 100, fat_g: (entry.fat_g / entry.grams!) * 100 } : null
  // the food's current servings (a deleted one falls back to grams via initialAmount)
  const units = list
  const resolved = amount ? resolveAmount(amount, units) : null
  const preview = per100 && resolved ? scale(per100, resolved.grams) : null

  const refresh = () => { void qc.invalidateQueries({ queryKey: ['diary'] }); void qc.invalidateQueries({ queryKey: ['foods'] }) }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    let patch: EntryPatch = { meal }
    if (isFood) {
      if (!resolved) return
      patch = { ...patch, ...resolved }
    } else {
      const n = (s: string) => Number(s.replace(',', '.') || 0)
      const nums = { kcal: n(quick.kcal), protein_g: n(quick.protein_g), carbs_g: n(quick.carbs_g), fat_g: n(quick.fat_g) }
      if (Object.values(nums).some((x) => !Number.isFinite(x) || x < 0)) return
      patch = { ...patch, name: quick.name.trim() || 'Quick add', ...nums }
    }
    setBusy(true)
    try { await updateEntry(entry.id, patch); refresh(); onClose() } catch (err) { toast(ruleMessage(err, 'Couldn’t save the change.'), { kind: 'error' }); setBusy(false) }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteEntry(entry.id)
      refresh(); onClose()
      toast(`Removed ${entry.name}`, { action: { label: 'Undo', onClick: () => void restoreEntry(entry).then(refresh) } })
    } catch { toast('Couldn’t delete that.', { kind: 'error' }); setBusy(false) }
  }

  return (
    <Dialog open onClose={onClose} title={`Edit ${entry.name}`} closable>
      <form onSubmit={(e) => void save(e)}>
        <h2 className="pr-8 text-lg font-semibold">{entry.name}</h2>
        {entry.brand && <p className="text-xs text-faint">{entry.brand}</p>}
        {!entry.food_id && isFood && <p className="mt-1 text-xs text-faint">This food was deleted; the numbers you logged are kept.</p>}

        <div className="mt-4">
          {isFood ? (
            amount ? <AmountPicker servings={units} value={amount} onChange={setAmount} /> : <div className="skeleton h-12" />
          ) : (
            <div className="space-y-3">
              <input value={quick.name} onChange={(e) => setQuick({ ...quick, name: e.target.value })} aria-label="Name" className="field" maxLength={160} />
              <div className="grid grid-cols-4 gap-2">
                {(['kcal', 'protein_g', 'carbs_g', 'fat_g'] as const).map((k) => (
                  <label key={k} className="block"><span className="mb-1 block text-xs text-muted">{{ kcal: 'kcal', protein_g: 'Protein', carbs_g: 'Carbs', fat_g: 'Fat' }[k]}</span>
                    <input inputMode="decimal" value={quick[k]} onChange={(e) => setQuick({ ...quick, [k]: e.target.value })} className="field tabular-nums" /></label>
                ))}
              </div>
            </div>
          )}
        </div>

        {isFood && (
          <div className="mt-3 rounded-2xl bg-panel px-4 py-3 text-sm">
            {preview ? <NutritionLine n={preview} /> : <span className="text-faint">Enter an amount</span>}
            {resolved && <span className="ml-2 text-xs text-faint">({fmtG(resolved.grams)} g)</span>}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Meal">
          {MEALS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={meal === m.id} onClick={() => setMeal(m.id)}
              className={`rounded-full px-3 py-1 text-sm ${meal === m.id ? 'bg-accent-soft font-semibold text-accent' : 'bg-panel text-muted hover:bg-hover'}`}>{m.label}</button>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger-soft">Delete</button>
          <span className="flex-1" />
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-hover">Cancel</button>
          <button disabled={busy || (isFood && !resolved)} className="bg-accent rounded-lg px-5 py-2 text-sm font-semibold text-on-accent">Save</button>
        </div>
      </form>
    </Dialog>
  )
}
