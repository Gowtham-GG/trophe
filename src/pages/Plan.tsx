import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { deletePlanItems, fetchPlan, groceryList, logPlan, planDays, setGroceryCheck } from '@/api/plan'
import { Card } from '@/components/Card'
import { IconCheck, IconChevron, IconPlus, IconX } from '@/components/icons'
import { useLog } from '@/contexts/LogContext'
import { useSettings } from '@/contexts/SettingsContext'
import { useToast } from '@/contexts/ToastContext'
import { addDays, formatDayHeading, formatFullDate, todayKey } from '@/lib/dates'
import { shortDate } from '@/lib/chart'
import { MEALS } from '@/lib/meals'
import { describeAmount, fmtG, fmtKcal } from '@/lib/nutrition'
import type { GroceryItem, PlanItem } from '@/types/db'

type Tab = 'plan' | 'groceries'

/** One planned day: its meals with what's planned, the day's total against the goal, and "log it" once it's here. */
function PlanDayCard({ day, today, items, kcal, goal }: { day: string; today: string; items: PlanItem[]; kcal: number; goal: number | null }) {
  const { timezone } = useSettings()
  const log = useLog()
  const { toast } = useToast()
  const qc = useQueryClient()
  const refresh = () => { for (const key of ['plan', 'diary', 'foods']) void qc.invalidateQueries({ queryKey: [key] }) }
  const canLog = day <= today
  const heading = day === addDays(today, 1) ? 'Tomorrow' : formatDayHeading(day, timezone)

  const logMeal = async (meal: string | null) => {
    try {
      const n = await logPlan(day, meal)
      refresh()
      toast(`Logged ${n} planned item${n === 1 ? '' : 's'} to the diary`)
    } catch { toast('Couldn’t log that.', { kind: 'error' }) }
  }
  const remove = async (id: string) => {
    try { await deletePlanItems([id]); refresh() } catch { toast('Couldn’t remove that.', { kind: 'error' }) }
  }

  return (
    <Card className="rise" pad={false}>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-1 pt-4">
        <h2 className="mr-auto font-semibold" title={formatFullDate(day)}>{heading}</h2>
        {items.length > 0 && <span className="text-xs tabular-nums text-muted">{fmtKcal(kcal)}{goal ? ` / ${fmtKcal(goal)}` : ''} kcal</span>}
        {canLog && items.length > 0 && <button onClick={() => void logMeal(null)} className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent hover:opacity-80">Log the day</button>}
      </div>
      <div className="px-2 pb-3">
        {MEALS.map((m) => {
          const mine = items.filter((i) => i.meal === m.id)
          return (
            <div key={m.id} className="px-3 py-1.5">
              <div className="flex items-center gap-2">
                <span className="label-caps mr-auto">{m.label}</span>
                {canLog && mine.length > 0 && <button onClick={() => void logMeal(m.id)} className="text-xs text-muted hover:text-ink">Log {m.label.toLowerCase()}</button>}
                <button onClick={() => log.open({ day, meal: m.id, plan: true })} aria-label={`Plan food for ${m.label}, ${heading}`}
                  className="rounded-full p-1 text-accent hover:bg-accent-soft"><IconPlus size={16} /></button>
              </div>
              {mine.map((i) => (
                <div key={i.id} className="flex items-baseline gap-2 py-0.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{i.food.name} <span className="text-xs text-faint">{describeAmount(i)}</span></span>
                  <span className="shrink-0 tabular-nums text-muted">{fmtKcal((i.food.kcal * i.grams) / 100)}</span>
                  <button onClick={() => void remove(i.id)} aria-label={`Remove ${i.food.name}`} className="shrink-0 self-center rounded p-0.5 text-faint hover:text-ink"><IconX size={13} /></button>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

const amount = (g: GroceryItem) => {
  const grams = g.grams >= 1000 ? `${fmtG(g.grams / 1000)} kg` : `${fmtG(g.grams)} g`
  return g.serving_label && g.serving_grams ? `${grams} · ≈ ${fmtG(Math.round((g.grams / g.serving_grams) * 2) / 2)} × ${g.serving_label}` : grams
}

/** What to buy for the week shown: grams per food (recipes opened into their ingredients), ticked as you shop. */
function Groceries({ from, to }: { from: string; to: string }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const key = ['plan', 'groceries', from, to]
  const list = useQuery({ queryKey: key, queryFn: () => groceryList(from, to) })
  const items = [...(list.data ?? [])].sort((a, b) => Number(a.checked) - Number(b.checked))

  const tick = async (g: GroceryItem) => {
    // instant: show it ticked now, put it back if the save fails
    qc.setQueryData<GroceryItem[]>(key, (l) => l?.map((x) => (x.food_id === g.food_id ? { ...x, checked: !g.checked } : x)))
    try { await setGroceryCheck(from, to, g.food_id, !g.checked) } catch { toast('Couldn’t save that.', { kind: 'error' }); void qc.invalidateQueries({ queryKey: key }) }
  }
  const copy = async () => {
    const text = items.filter((g) => !g.checked).map((g) => `• ${g.name}${g.brand ? ` (${g.brand})` : ''} — ${amount(g)}`).join('\n')
    try { await navigator.clipboard.writeText(`Groceries ${shortDate(from)} – ${shortDate(to)}\n${text}`); toast('List copied') } catch { toast('Couldn’t copy the list.', { kind: 'error' }) }
  }

  if (list.isSuccess && !items.length) return <Card><p className="text-sm text-muted">Nothing planned this week yet. Plan some meals and the shopping list builds itself.</p></Card>
  return (
    <Card title={`For ${shortDate(from)} – ${shortDate(to)}`} aside={<button onClick={() => void copy()} className="text-sm font-medium text-accent">Copy list</button>} className="rise">
      <ul>
        {items.map((g) => (
          <li key={g.food_id}>
            <button onClick={() => void tick(g)} role="checkbox" aria-checked={g.checked} className="flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-hover">
              <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border ${g.checked ? 'border-accent bg-accent text-on-accent' : 'border-line'}`}>{g.checked && <IconCheck size={14} />}</span>
              <span className={`min-w-0 flex-1 ${g.checked ? 'text-faint line-through' : ''}`}>
                <span className="block text-sm font-medium">{g.name}{g.brand && <span className="font-normal text-faint"> · {g.brand}</span>}</span>
                <span className="block text-xs text-muted">{amount(g)}{g.for_recipes.length > 0 && <span className="text-faint"> · for {g.for_recipes.join(', ')}</span>}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-faint">Planned recipes are listed as their ingredients, for the share of the pot you planned. Amounts are as the foods are logged (cooked dishes as cooked).</p>
    </Card>
  )
}

/** Meal plan: a week of days to plan food into (logged with a tap when the day comes), and its grocery list. */
export function Plan() {
  const { timezone } = useSettings()
  const today = todayKey(timezone)
  const [start, setStart] = useState(today)
  const [tab, setTab] = useState<Tab>('plan')
  const end = addDays(start, 6)
  const items = useQuery({ queryKey: ['plan', 'items', start, end], queryFn: () => fetchPlan(start, end) })
  const days = useQuery({ queryKey: ['plan', 'days', start, end], queryFn: () => planDays(start, end) })

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-top mx-auto max-w-3xl space-y-4 px-4 pb-32 lg:px-6 lg:pb-8">
        <header className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-[28px] font-semibold leading-tight">Meal plan</h1>
          <div className="flex items-center gap-1 rounded-full bg-panel p-1">
            <button aria-label="Previous week" onClick={() => setStart(addDays(start, -7))} className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-ink"><IconChevron size={16} className="rotate-180" /></button>
            <button onClick={() => setStart(today)} className="min-w-32 text-center text-sm font-semibold">{start === today ? 'Next 7 days' : `${shortDate(start)} – ${shortDate(end)}`}</button>
            <button aria-label="Next week" onClick={() => setStart(addDays(start, 7))} className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-ink"><IconChevron size={16} /></button>
          </div>
        </header>
        <div className="flex gap-1.5" role="tablist">
          {([['plan', 'Plan'], ['groceries', 'Groceries']] as const).map(([t, label]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`rounded-full px-3.5 py-1.5 text-sm ${tab === t ? 'bg-accent-soft font-semibold text-accent' : 'text-muted hover:bg-hover hover:text-ink'}`}>{label}</button>
          ))}
        </div>
        {tab === 'plan' ? (
          (days.data ?? []).map((d) => (
            <PlanDayCard key={d.day} day={d.day} today={today} items={(items.data ?? []).filter((i) => i.day === d.day)} kcal={d.kcal} goal={d.goal_kcal} />
          ))
        ) : <Groceries from={start} to={end} />}
      </div>
    </div>
  )
}
