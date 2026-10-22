import { useQuery } from '@tanstack/react-query'
import { foodSpending } from '@/api/links'
import { nutritionStats } from '@/api/trends'
import { useSettings } from '@/contexts/SettingsContext'
import { dayNumber } from '@/lib/chart'
import { Card } from '../Card'

const inr = (n: number) => n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

/** What the chosen Argus categories (food, groceries, eating out…) cost over the range, and per 1,000 kcal eaten. */
export function FoodSpendingCard({ from, to }: { from: string; to: string }) {
  const { links } = useSettings()
  const ids = links.argus?.food_categories ?? []
  const spend = useQuery({ queryKey: ['argus', 'spend', ids, from, to], queryFn: () => foodSpending(ids, from, to), enabled: ids.length > 0 })
  const stats = useQuery({ queryKey: ['diary', 'stats', from, to], queryFn: () => nutritionStats(from, to), enabled: ids.length > 0 })
  if (!ids.length || !spend.data) return null
  const total = spend.data.reduce((s, d) => s + d.amount, 0)
  const days = dayNumber(to) - dayNumber(from) + 1
  const kcal = stats.data?.avg.kcal != null ? stats.data.avg.kcal * stats.data.logged_days : null
  return (
    <Card title="Food spending" aside="from Argus" className="rise">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-panel px-3 py-2"><p className="text-xs text-muted">This range</p><p className="text-lg font-semibold">{inr(total)}</p></div>
        <div className="rounded-xl bg-panel px-3 py-2"><p className="text-xs text-muted">Per day</p><p className="text-lg font-semibold">{inr(total / days)}</p></div>
        <div className="rounded-xl bg-panel px-3 py-2"><p className="text-xs text-muted">Per 1,000 kcal</p><p className="text-lg font-semibold">{kcal ? inr((total / kcal) * 1000) : '—'}</p></div>
      </div>
      <p className="mt-2 text-[11px] text-faint">Per 1,000 kcal compares spending with what you logged; days you didn’t log make it look higher.</p>
    </Card>
  )
}
