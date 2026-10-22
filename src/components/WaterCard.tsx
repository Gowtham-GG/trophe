import { useQuery, useQueryClient } from '@tanstack/react-query'
import { addWater, deleteWater, fetchWater } from '@/api/body'
import { useSettings } from '@/contexts/SettingsContext'
import { useToast } from '@/contexts/ToastContext'
import { Card } from './Card'
import { IconDrop } from './icons'

const fmtL = (ml: number) => (ml >= 1000 ? `${(ml / 1000).toLocaleString('en-IN', { maximumFractionDigits: 2 })} l` : `${ml} ml`)

/** Water for one day: a bar toward the goal, quick +250 / +500 ml, and take back the last glass. */
export function WaterCard({ day }: { day: string }) {
  const { waterGoal } = useSettings()
  const { toast } = useToast()
  const qc = useQueryClient()
  const key = ['water', day]
  const water = useQuery({ queryKey: key, queryFn: () => fetchWater(day) })
  const entries = water.data ?? []
  const total = entries.reduce((s, e) => s + e.ml, 0)
  const pct = Math.min(total / waterGoal, 1) * 100
  const last = entries[entries.length - 1]

  const refresh = () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: ['water-range'] }) }
  const add = async (ml: number) => {
    try { await addWater(day, ml); refresh() } catch { toast('Couldn’t add the water.', { kind: 'error' }) }
  }
  const undo = async () => {
    if (!last) return
    try { await deleteWater(last.id); refresh() } catch { toast('Couldn’t remove that.', { kind: 'error' }) }
  }

  return (
    <Card title="Water" aside={<span className="tabular-nums">{fmtL(total)} of {fmtL(waterGoal)}</span>} className="rise">
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-panel" role="meter" aria-valuemin={0} aria-valuemax={waterGoal} aria-valuenow={total} aria-label={`Water: ${fmtL(total)} of ${fmtL(waterGoal)}`}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--question)', transition: 'width 600ms cubic-bezier(0.2,0.8,0.2,1)' }} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {[250, 500].map((ml) => (
          <button key={ml} onClick={() => void add(ml)} aria-label={`Add ${ml} ml of water`}
            className="flex items-center gap-1.5 rounded-full bg-question-soft px-3 py-1.5 text-sm font-medium text-ink hover:opacity-80">
            <IconDrop size={15} className="text-question" />+{ml} ml
          </button>
        ))}
        {last && <button onClick={() => void undo()} className="ml-auto text-xs text-muted hover:text-ink">Remove last ({fmtL(last.ml)})</button>}
        {total >= waterGoal && <span className="w-full text-xs text-muted">Goal reached.</span>}
      </div>
    </Card>
  )
}
