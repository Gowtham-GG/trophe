import { useQuery } from '@tanstack/react-query'
import { nutritionPeriods, nutritionStats, streaks } from '@/api/trends'
import { dayNumber, shortDate } from '@/lib/chart'
import { fmtKcal } from '@/lib/nutrition'
import { Card } from '../Card'
import { ColumnChart } from '../charts/ColumnChart'

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-panel px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {note && <p className="text-[11px] text-faint">{note}</p>}
    </div>
  )
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`

/** Eating over the range: daily averages, weekly or monthly columns against the goal, and weekdays vs weekends. */
export function EatingCard({ from, to }: { from: string; to: string }) {
  const period = dayNumber(to) - dayNumber(from) > 100 ? 'month' : 'week'
  const stats = useQuery({ queryKey: ['diary', 'stats', from, to], queryFn: () => nutritionStats(from, to) })
  const periods = useQuery({ queryKey: ['diary', 'periods', from, to, period], queryFn: () => nutritionPeriods(from, to, period) })
  const s = stats.data

  if (s && s.logged_days === 0) {
    return <Card title="Eating" className="rise"><p className="text-sm text-muted">Nothing logged in this range yet. Averages, streaks and weekday patterns show up once you’ve logged a few days.</p></Card>
  }
  const goal = s?.avg_goal_kcal
  // a range across two years labels its months with the year ("Oct ’25"), so the two Octobers can be told apart
  const twoYears = from.slice(0, 4) !== to.slice(0, 4)
  const monthLabel = (d: string) => `${shortDate(d, true)}${twoYears ? ` ’${d.slice(2, 4)}` : ''}`
  const diff = s?.weekday.kcal != null && s.weekend.kcal != null ? s.weekend.kcal - s.weekday.kcal : null

  return (
    <Card title="Eating" aside={s && `${days(s.logged_days)} logged of ${s.days}`} className="rise">
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Calories / day" value={s.avg.kcal != null ? fmtKcal(s.avg.kcal) : '—'} note={goal != null ? `goal ${fmtKcal(goal)}` : 'no goal set'} />
          <Stat label="Protein / day" value={s.avg.protein_g != null ? `${Math.round(s.avg.protein_g)} g` : '—'} note={s.avg.carbs_g != null ? `C ${Math.round(s.avg.carbs_g)} · F ${Math.round(s.avg.fat_g ?? 0)} g` : undefined} />
          <Stat label="On target" value={goal != null ? days(s.status.on) : '—'} note={goal != null ? `within 10 % · ${s.status.under} under · ${s.status.over} over` : 'set a goal to see this'} />
          <Stat label="Weekends" value={diff != null ? `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${fmtKcal(Math.abs(diff))} kcal` : '—'}
            note={diff != null ? `${fmtKcal(s.weekend.kcal!)} vs ${fmtKcal(s.weekday.kcal!)} on weekdays` : 'needs both logged'} />
        </div>
      )}
      {periods.data && (
        <ColumnChart unit="kcal" label={`Average calories per ${period}`}
          data={periods.data.map((p) => ({
            key: p.period_start,
            label: period === 'month' ? monthLabel(p.period_start) : shortDate(p.period_start),
            title: period === 'month' ? new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(`${p.period_start}T00:00:00Z`)) : `Week of ${shortDate(p.period_start)}`,
            value: p.kcal, target: p.goal_kcal,
            lines: [
              ...(p.protein_g != null ? [`P ${Math.round(p.protein_g)} · C ${Math.round(p.carbs_g ?? 0)} · F ${Math.round(p.fat_g ?? 0)} g`] : []),
              `${p.logged_days} of ${p.days} days logged`,
              ...(p.goal_kcal != null && p.logged_days ? [`${p.on_target} on target`] : []),
            ],
          }))} />
      )}
      <p className="mt-2 text-[11px] text-faint">Averages count only days with something logged. “On target” is within 10 % of that day’s goal.</p>
    </Card>
  )
}

/** Days in a row with something logged, and days in a row on target: now and best (last 400 days). */
export function StreaksCard({ today }: { today: string }) {
  const q = useQuery({ queryKey: ['diary', 'streaks', today], queryFn: () => streaks(today) })
  const s = q.data
  if (!s || s.logging_best === 0) return null
  return (
    <Card title="Streaks" className="rise">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Logging" value={days(s.logging_current)} note={`best ${days(s.logging_best)}`} />
        <Stat label="On target" value={days(s.target_current)} note={`best ${days(s.target_best)}`} />
      </div>
      <p className="mt-2 text-[11px] text-faint">Today counts once it’s logged; until then a streak runs to yesterday.</p>
    </Card>
  )
}
