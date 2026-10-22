import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { copyEntries, daySummary, fetchDayEntries } from '@/api/diary'
import { ruleMessage } from '@/api/errors'
import { saveMealAsTemplate } from '@/api/templates'
import { useLog } from '@/contexts/LogContext'
import { useToast } from '@/contexts/ToastContext'
import { addDays } from '@/lib/dates'
import { MEALS } from '@/lib/meals'
import { describeAmount, fmtG, fmtKcal } from '@/lib/nutrition'
import type { DaySummary, DiaryEntry, MacroTotals } from '@/types/db'
import { Card } from './Card'
import { Dialog } from './Dialog'
import { EntryDialog } from './EntryDialog'
import { IconMore, IconPlus } from './icons'
import { MacroBar, Ring } from './Ring'
import { MicrosCard } from './MicrosCard'
import { WaterCard } from './WaterCard'

// The macro colours keep one meaning everywhere: protein = teal, carbs = accent, fat = amber.
const MACRO_TONES = { protein_g: 'var(--task)', carbs_g: 'var(--accent)', fat_g: 'var(--important)' } as const

/** The calorie ring: what's left of the goal (amber once over), or just what was eaten when there's no goal. */
function CaloriesCard({ s }: { s: DaySummary | undefined }) {
  const eaten = s?.totals.kcal ?? 0
  const goal = s?.goal?.kcal ?? null
  const left = goal != null ? goal - eaten : null
  return (
    <Card title="Calories" className="rise flex flex-col items-center">
      <div className="flex w-full justify-center py-2">
        <Ring value={goal ? eaten / goal : 0} label={goal ? `${fmtKcal(eaten)} of ${fmtKcal(goal)} kcal eaten` : `${fmtKcal(eaten)} kcal eaten`}>
          {left != null ? (
            <>
              <span className={`text-3xl font-bold tabular-nums ${left < 0 ? 'text-important' : ''}`}>{fmtKcal(Math.abs(left))}</span>
              <span className="text-xs text-muted">{left < 0 ? 'kcal over' : 'kcal left'}</span>
            </>
          ) : (
            <>
              <span className="text-3xl font-bold tabular-nums">{fmtKcal(eaten)}</span>
              <span className="text-xs text-muted">kcal eaten</span>
            </>
          )}
        </Ring>
      </div>
      {goal != null ? (
        <p className="mt-3 text-center text-sm text-muted tabular-nums">{fmtKcal(eaten)} eaten · {fmtKcal(goal)} goal</p>
      ) : (
        <Link to="/settings#goals" className="mt-3 text-center text-sm">Set your calorie goal</Link>
      )}
    </Card>
  )
}

function MacrosCard({ s }: { s: DaySummary | undefined }) {
  const t = s?.totals, g = s?.goal
  const rows = [['Protein', 'protein_g'], ['Carbs', 'carbs_g'], ['Fat', 'fat_g']] as const
  return (
    <Card title="Macros" aside={g?.fiber_g && t ? <span className="tabular-nums">Fibre {fmtG(t.fiber_g ?? 0)} / {g.fiber_g} g</span> : null} className="rise">
      <div className="space-y-4">
        {rows.map(([name, k]) => <MacroBar key={k} name={name} eaten={t ? Math.round(t[k]) : null} target={g ? g[k] : null} tone={MACRO_TONES[k]} />)}
      </div>
    </Card>
  )
}

/** Name the saved meal, then save what's logged at this meal. */
function SaveMealDialog({ day, meal, label, onClose }: { day: string; meal: string; label: string; onClose: () => void }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [name, setName] = useState(`My ${label.toLowerCase()}`)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await saveMealAsTemplate(name.trim(), day, meal)
      void qc.invalidateQueries({ queryKey: ['templates'] })
      toast(`Saved “${name.trim()}”. Find it under Saved meals when logging.`)
      onClose()
    } catch (err) { toast(ruleMessage(err, 'Couldn’t save the meal.'), { kind: 'error' }) }
  }
  return (
    <Dialog open onClose={onClose} title="Save as a meal">
      <form onSubmit={(e) => void submit(e)}>
        <h2 className="mb-1 text-lg font-semibold">Save as a meal</h2>
        <p className="mb-4 text-sm text-muted">Log all of these foods again in one tap. Quick adds aren’t included.</p>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Meal name" className="field mb-4" maxLength={80} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-hover">Cancel</button>
          <button disabled={!name.trim()} className="bg-accent rounded-lg px-5 py-2 text-sm font-semibold text-on-accent">Save meal</button>
        </div>
      </form>
    </Dialog>
  )
}

function MealCard({ day, meal, label, entries, totals, onEdit }: {
  day: string; meal: string; label: string; entries: DiaryEntry[]; totals: MacroTotals | undefined; onEdit: (e: DiaryEntry) => void
}) {
  const log = useLog()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [menu, setMenu] = useState(false)
  const [saving, setSaving] = useState(false)

  const copyYesterday = async () => {
    setMenu(false)
    try {
      const n = await copyEntries(addDays(day, -1), day, meal)
      void qc.invalidateQueries({ queryKey: ['diary'] }); void qc.invalidateQueries({ queryKey: ['foods'] })
      toast(n ? `Copied ${n} item${n === 1 ? '' : 's'} from yesterday’s ${label.toLowerCase()}` : `Nothing was logged at ${label.toLowerCase()} yesterday.`)
    } catch { toast('Couldn’t copy that.', { kind: 'error' }) }
  }

  const aside = (
    <span className="flex items-center gap-1">
      {totals && <span className="mr-1 text-xs tabular-nums text-muted">{fmtKcal(totals.kcal)} kcal</span>}
      <button onClick={() => log.open({ day, meal })} aria-label={`Log food to ${label}`} title={`Log to ${label}`} className="rounded-full p-1.5 text-accent hover:bg-accent-soft"><IconPlus size={18} /></button>
      <span className="relative">
        <button onClick={() => setMenu((v) => !v)} aria-label={`${label} options`} aria-haspopup="menu" aria-expanded={menu} className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-ink"><IconMore size={18} /></button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div role="menu" className="glass-strong pop absolute right-0 top-full z-50 mt-1 w-56 rounded-2xl p-1.5 text-left">
              <button role="menuitem" onClick={() => void copyYesterday()} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-hover">Copy from yesterday</button>
              <button role="menuitem" disabled={!entries.some((e) => e.food_id)} onClick={() => { setMenu(false); setSaving(true) }} className="block w-full rounded-xl px-3 py-2 text-left text-sm text-ink hover:bg-hover">Save as a meal…</button>
            </div>
          </>
        )}
      </span>
    </span>
  )

  return (
    <Card className="rise relative focus-within:z-20" pad={false}>
      {/* own header (not Card's title): the buttons need centre alignment, not baseline */}
      <div className="flex items-center justify-between gap-3 py-2 pl-5 pr-3">
        <h2 className="label-caps">{label}</h2>
        {aside}
      </div>
      <div className="px-2 pb-3">
        {entries.length === 0 ? (
          <div className="flex flex-wrap items-center gap-x-3 px-3 py-1 text-sm">
            <span className="text-faint">Nothing logged yet.</span>
            <button onClick={() => void copyYesterday()} className="text-muted hover:text-ink">Same as yesterday?</button>
          </div>
        ) : (
          <ul>
            {entries.map((e) => (
              <li key={e.id}>
                <button onClick={() => onEdit(e)} className="flex w-full items-baseline gap-3 rounded-xl px-3 py-2 text-left hover:bg-hover">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{e.name}{e.brand && <span className="font-normal text-faint"> · {e.brand}</span>}</span>
                    <span className="block truncate text-xs text-muted tabular-nums">
                      {describeAmount(e) || 'Quick add'}<span className="text-faint"> · </span>P {fmtG(e.protein_g)} · C {fmtG(e.carbs_g)} · F {fmtG(e.fat_g)}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{fmtKcal(e.kcal)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {saving && <SaveMealDialog day={day} meal={meal} label={label} onClose={() => setSaving(false)} />}
    </Card>
  )
}

/** One day of the diary: calories ring, macros, and the meals with everything logged. `side` goes under the ring. */
export function DayView({ day, side }: { day: string; side?: React.ReactNode }) {
  const summary = useQuery({ queryKey: ['diary', 'summary', day], queryFn: () => daySummary(day) })
  const entries = useQuery({ queryKey: ['diary', 'entries', day], queryFn: () => fetchDayEntries(day) })
  const [editing, setEditing] = useState<DiaryEntry | null>(null)
  const s = summary.data

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="min-w-0 space-y-4 lg:self-start">
        <CaloriesCard s={s} />
        <WaterCard day={day} />
        {side}
      </div>
      <div className="min-w-0 space-y-4 lg:col-span-2">
        <MacrosCard s={s} />
        {MEALS.map((m) => (
          <MealCard key={m.id} day={day} meal={m.id} label={m.label} totals={s?.meals[m.id]}
            entries={(entries.data ?? []).filter((e) => e.meal === m.id)} onEdit={setEditing} />
        ))}
        <MicrosCard from={day} to={day} collapsed />
      </div>
      {editing && <EntryDialog entry={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
