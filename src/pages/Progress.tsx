import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { waterRange } from '@/api/body'
import { Card } from '@/components/Card'
import { MeasurementsCard, WeightCard } from '@/components/progress/BodyCards'
import { EatingCard, StreaksCard } from '@/components/progress/EatingCards'
import { MaintenanceCard } from '@/components/progress/MaintenanceCard'
import { useSettings } from '@/contexts/SettingsContext'
import { addDays, todayKey } from '@/lib/dates'

const RANGES = [
  { id: '1m', label: '1 month', days: 30 },
  { id: '3m', label: '3 months', days: 91 },
  { id: '6m', label: '6 months', days: 182 },
  { id: '1y', label: '1 year', days: 365 },
] as const
type RangeId = (typeof RANGES)[number]['id']
const RANGE_KEY = 'trophe-progress-range'

function storedRange(): RangeId {
  try { const v = localStorage.getItem(RANGE_KEY); return RANGES.some((r) => r.id === v) ? (v as RangeId) : '3m' } catch { return '3m' }
}

/** Water over the range: the daily average on days you logged any, and how often you reached the goal. */
function WaterSummary({ from, to }: { from: string; to: string }) {
  const { waterGoal } = useSettings()
  const days = useQuery({ queryKey: ['water-range', from, to], queryFn: () => waterRange(from, to) })
  const logged = (days.data ?? []).filter((d) => d.ml > 0)
  if (!days.isSuccess || !logged.length) return null
  const avg = logged.reduce((s, d) => s + d.ml, 0) / logged.length
  const met = logged.filter((d) => d.ml >= waterGoal).length
  return (
    <Card title="Water" className="rise">
      <p className="text-sm text-muted">
        <b className="text-lg font-semibold text-ink">{(avg / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} l</b> a day on average
        <span className="text-faint"> · </span>goal of {waterGoal / 1000} l reached on {met} of {logged.length} day{logged.length === 1 ? '' : 's'} logged
      </p>
    </Card>
  )
}

/** Progress: weight with its trend, eating over time, streaks, measurements and water. One range scopes it all. */
export function Progress() {
  const { timezone } = useSettings()
  const [range, setRange] = useState<RangeId>(storedRange)
  const to = todayKey(timezone)
  const from = addDays(to, -(RANGES.find((r) => r.id === range)!.days - 1))
  const choose = (id: RangeId) => { setRange(id); try { localStorage.setItem(RANGE_KEY, id) } catch { /* private mode */ } }

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-top mx-auto max-w-3xl space-y-4 px-4 pb-32 lg:px-6 lg:pb-8">
        <h1 className="text-[28px] font-semibold leading-tight">Progress</h1>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r.id} role="radio" aria-checked={range === r.id} onClick={() => choose(r.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm ${range === r.id ? 'bg-accent-soft font-semibold text-accent' : 'text-muted hover:bg-hover hover:text-ink'}`}>{r.label}</button>
          ))}
        </div>
        <WeightCard from={from} to={to} />
        <MaintenanceCard today={to} />
        <EatingCard from={from} to={to} />
        <StreaksCard today={to} />
        <MeasurementsCard from={from} to={to} />
        <WaterSummary from={from} to={to} />
      </div>
    </div>
  )
}
