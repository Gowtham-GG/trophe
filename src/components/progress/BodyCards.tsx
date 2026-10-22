import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMeasurements, saveMeasurement, weightSummary, weightTrend } from '@/api/body'
import { ruleMessage } from '@/api/errors'
import { saveWeighIn } from '@/api/goals'
import { useToast } from '@/contexts/ToastContext'
import { parseQty } from '@/lib/amount'
import { shortDate } from '@/lib/chart'
import { MEASURES, type MeasureKey, type Measurement } from '@/types/db'
import { Card } from '../Card'
import { TrendChart } from '../charts/TrendChart'
import { Dialog } from '../Dialog'

const kg = (n: number) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg`
const signed = (n: number, unit: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${unit}`

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-panel px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {note && <p className="text-[11px] text-faint">{note}</p>}
    </div>
  )
}

/** Weight: today's weigh-in, the trend, its weekly pace, change over the range, and the chart. */
export function WeightCard({ from, to }: { from: string; to: string }) {
  const { toast, confirm } = useToast()
  const qc = useQueryClient()
  const points = useQuery({ queryKey: ['weight', 'trend', from, to], queryFn: () => weightTrend(from, to) })
  const summary = useQuery({ queryKey: ['weight', 'summary'], queryFn: weightSummary })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const v = parseQty(text)
    if (!(v >= 20 && v <= 400)) return toast('Enter your weight in kg, e.g. 72.4', { kind: 'error' })
    setBusy(true)
    try {
      await saveWeighIn(to, Math.round(v * 100) / 100)
      setText('')
      for (const key of ['weight', 'weigh-ins', 'maintenance']) void qc.invalidateQueries({ queryKey: [key] })
      const s = await weightSummary().catch(() => null)
      confirm({ kicker: 'Weigh-in saved', title: kg(v), detail: s?.latest ? `trend ${kg(s.latest.trend)}` : undefined,
        stats: s?.week_rate != null ? [{ label: 'Per week', value: Math.abs(s.week_rate) < 0.05 ? 'Steady' : signed(s.week_rate, 'kg') }] : undefined })
    } catch (err) { toast(ruleMessage(err, 'Couldn’t save the weight.'), { kind: 'error' }) } finally { setBusy(false) }
  }

  const s = summary.data
  const data = points.data ?? []
  const first = data[0], last = data[data.length - 1]
  const rate = s?.week_rate
  const pace = rate == null ? '—' : Math.abs(rate) < 0.05 ? 'Steady' : signed(rate, 'kg')

  return (
    <Card title="Weight" className="rise">
      <form onSubmit={(e) => void submit(e)} className="mb-4 flex gap-2">
        <span className="relative block w-40">
          <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder={s?.latest ? String(s.latest.kg) : '72.4'} aria-label="Today’s weight in kg" className="field pr-9 tabular-nums" />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">kg</span>
        </span>
        <button disabled={busy || !text.trim()} className="bg-accent rounded-lg px-4 py-2 text-sm font-semibold text-on-accent">Log today</button>
      </form>

      {s?.latest ? (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <Stat label="Trend" value={kg(s.latest.trend)} note={`last weighed ${kg(s.latest.kg)}`} />
            <Stat label="Per week" value={pace} note={rate == null ? 'needs a week of weigh-ins' : 'trend, last 2 weeks'} />
            <Stat label="This range" value={first && last && first !== last ? signed(last.trend - first.trend, 'kg') : '—'} note={first ? `since ${shortDate(first.day)}` : 'no weigh-ins'} />
          </div>
          {data.length > 0
            ? <TrendChart data={data.map((d) => ({ day: d.day, value: d.kg, trend: d.trend }))} from={from} to={to} unit="kg" label={`Weight from ${from} to ${to}`} />
            : <p className="text-sm text-faint">No weigh-ins in this range.</p>}
          <p className="mt-2 text-[11px] text-faint">Daily weight swings with water and salt; the trend line smooths that out. Weigh at the same time each day, ideally in the morning.</p>
        </>
      ) : summary.isSuccess && (
        <p className="text-sm text-muted">Log your weight a few times a week and a trend line appears here, with how fast it’s moving.</p>
      )}
    </Card>
  )
}

const MEASURE_LABEL: Record<MeasureKey, { label: string; unit: string }> = {
  waist_cm: { label: 'Waist', unit: 'cm' }, hips_cm: { label: 'Hips', unit: 'cm' }, chest_cm: { label: 'Chest', unit: 'cm' },
  neck_cm: { label: 'Neck', unit: 'cm' }, arm_cm: { label: 'Arm', unit: 'cm' }, thigh_cm: { label: 'Thigh', unit: 'cm' },
  body_fat_pct: { label: 'Body fat', unit: '%' },
}

function MeasureDialog({ day, latest, onClose }: { day: string; latest: Measurement | undefined; onClose: () => void }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [v, setV] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const values: Partial<Record<MeasureKey, number>> = {}
    for (const k of MEASURES) {
      if (!v[k]?.trim()) continue
      const n = parseQty(v[k])
      if (!Number.isFinite(n) || n <= 0) return toast(`Check ${MEASURE_LABEL[k].label.toLowerCase()}.`, { kind: 'error' })
      values[k] = Math.round(n * 10) / 10
    }
    if (!Object.keys(values).length) return onClose()
    setBusy(true)
    try {
      await saveMeasurement(day, values)
      void qc.invalidateQueries({ queryKey: ['measurements'] })
      toast('Measurements saved'); onClose()
    } catch (err) { toast(ruleMessage(err, 'Couldn’t save — check the numbers.'), { kind: 'error' }); setBusy(false) }
  }
  return (
    <Dialog open onClose={onClose} title="Measurements" closable>
      <form onSubmit={(e) => void submit(e)}>
        <h2 className="mb-1 text-lg font-semibold">Today’s measurements</h2>
        <p className="mb-4 text-sm text-muted">Fill in any you took. Measure at the same spots each time.</p>
        <div className="grid grid-cols-2 gap-3">
          {MEASURES.map((k) => (
            <label key={k} className="block"><span className="mb-1 block text-xs text-muted">{MEASURE_LABEL[k].label}</span>
              <span className="relative block">
                <input inputMode="decimal" value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder={latest?.[k] != null ? String(latest[k]) : ''} className="field pr-10 tabular-nums" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">{MEASURE_LABEL[k].unit}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-hover">Cancel</button>
          <button disabled={busy} className="bg-accent rounded-lg px-5 py-2 text-sm font-semibold text-on-accent">Save</button>
        </div>
      </form>
    </Dialog>
  )
}

/** Body measurements: the latest of each, the change over the range, and a chart of one at a time. */
export function MeasurementsCard({ from, to }: { from: string; to: string }) {
  const rows = useQuery({ queryKey: ['measurements'], queryFn: () => fetchMeasurements() })
  const [open, setOpen] = useState(false)
  const all = rows.data ?? []
  const taken = MEASURES.filter((k) => all.some((r) => r[k] != null))
  const [pick, setPick] = useState<MeasureKey | null>(null)
  const shown = pick && taken.includes(pick) ? pick : taken[0]
  const inRange = (k: MeasureKey) => all.filter((r) => r[k] != null && r.day >= from && r.day <= to).reverse()

  return (
    <Card title="Measurements" aside={<button onClick={() => setOpen(true)} className="text-sm font-medium text-accent">Add</button>} className="rise">
      {rows.isSuccess && !taken.length && <p className="text-sm text-muted">Waist, hips and body fat show change the scale can miss. Add them every few weeks.</p>}
      {taken.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {taken.map((k) => {
              const series = inRange(k)
              const latest = all.find((r) => r[k] != null)!
              const change = series.length > 1 ? series[series.length - 1][k]! - series[0][k]! : null
              const u = MEASURE_LABEL[k].unit
              return (
                <button key={k} onClick={() => setPick(k)} aria-pressed={shown === k} className={`rounded-xl px-3 py-2 text-left ${shown === k ? 'bg-accent-soft' : 'bg-panel hover:bg-hover'}`}>
                  <p className="text-xs text-muted">{MEASURE_LABEL[k].label}</p>
                  <p className="text-lg font-semibold">{latest[k]} <span className="text-xs font-normal text-faint">{u}</span></p>
                  <p className="text-[11px] text-faint">{change != null ? `${signed(change, u)} this range` : shortDate(latest.day)}</p>
                </button>
              )
            })}
          </div>
          {shown && inRange(shown).length > 0
            ? <TrendChart data={inRange(shown).map((r) => ({ day: r.day, value: r[shown]! }))} from={from} to={to} unit={MEASURE_LABEL[shown].unit}
                label={`${MEASURE_LABEL[shown].label} from ${from} to ${to}`} dotsLabel={MEASURE_LABEL[shown].label} height={180} />
            : <p className="text-sm text-faint">No {shown && MEASURE_LABEL[shown].label.toLowerCase()} measurements in this range.</p>}
        </>
      )}
      {open && <MeasureDialog day={to} latest={all[0]} onClose={() => setOpen(false)} />}
    </Card>
  )
}
