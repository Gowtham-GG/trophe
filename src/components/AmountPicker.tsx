import { useState } from 'react'
import { parseQty, type AmountState } from '@/lib/amount'
import { fmtG } from '@/lib/nutrition'
import type { FoodServing } from '@/types/db'

const QUICK = [0.5, 1, 1.5, 2]

/** Quantity + unit (the food's servings, or grams). Typing "1,5" or "½" works; quick buttons for servings. */
export function AmountPicker({ servings, value, onChange, autoFocus, compact }: {
  servings: Pick<FoodServing, 'id' | 'label' | 'grams'>[]; value: AmountState; onChange: (a: AmountState) => void; autoFocus?: boolean
  /** a row in a list: smaller, without the quick ½ / 1 / 1½ / 2 buttons */
  compact?: boolean
}) {
  const [text, setText] = useState(fmtG(value.qty))
  const setQty = (q: number) => { setText(fmtG(q)); onChange({ ...value, qty: q }) }
  return (
    <div>
      <div className="flex gap-2">
        <input
          inputMode="decimal" aria-label="Quantity" autoFocus={autoFocus} value={text}
          onChange={(e) => { setText(e.target.value); onChange({ ...value, qty: parseQty(e.target.value) }) }}
          onFocus={(e) => e.target.select()}
          className={`field text-center tabular-nums ${compact ? 'w-20' : 'w-24 text-lg font-semibold'}`}
        />
        <select aria-label="Unit" value={value.unit} className="field min-w-0 flex-1"
          onChange={(e) => {
            const unit = e.target.value
            // switching units keeps the amount sensible: 1 serving, or the grams the old choice meant
            const prev = servings.find((s) => s.id === value.unit)
            const qty = unit === 'g' ? Math.round((prev ? prev.grams * value.qty : 100) * 10) / 10 : 1
            setText(fmtG(qty)); onChange({ unit, qty })
          }}>
          {servings.map((s) => <option key={s.id} value={s.id}>{s.label} ({fmtG(s.grams)} g)</option>)}
          <option value="g">grams</option>
        </select>
      </div>
      {value.unit !== 'g' && !compact && (
        <div className="mt-2 flex gap-1.5">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => setQty(q)}
              className={`rounded-full px-3 py-1 text-sm tabular-nums ${value.qty === q ? 'bg-accent-soft font-semibold text-accent' : 'bg-panel text-muted hover:bg-hover hover:text-ink'}`}>
              {q === 0.5 ? '½' : q === 1.5 ? '1½' : q}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
