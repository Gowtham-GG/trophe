import { Card } from '@/components/Card'
import { IconDrop, IconFlame, IconScale } from '@/components/icons'
import { MacroBar, Ring } from '@/components/Ring'
import { useSettings } from '@/contexts/SettingsContext'
import { formatFullDate, todayKey } from '@/lib/dates'
import { MEALS } from '@/lib/meals'

// The macro colours keep one meaning everywhere: protein = teal, carbs = accent, fat = amber.
const MACROS = [
  { name: 'Protein', tone: 'var(--task)' },
  { name: 'Carbs', tone: 'var(--accent)' },
  { name: 'Fat', tone: 'var(--important)' },
]

/** Today: the day's ring, macros and meals. Phase 0 shows the layout empty; Phase 1 fills it from day_summary(). */
export function Home() {
  const { timezone: tz } = useSettings()
  const day = todayKey(tz)

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-top mx-auto max-w-5xl px-4 pb-32 lg:px-6 lg:pb-8">
        <header className="rise mb-5">
          <p className="label-caps">{formatFullDate(day)}</p>
          <h1 className="mt-1 text-[34px] font-bold leading-tight">Today</h1>
        </header>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Calories" className="rise flex flex-col items-center lg:row-span-2">
            <div className="flex w-full justify-center py-2">
              <Ring value={0} label="No calories logged yet">
                <span className="text-3xl font-bold tabular-nums">0</span>
                <span className="text-xs text-muted">of — kcal</span>
              </Ring>
            </div>
            <p className="mt-3 text-center text-sm text-faint">Set your calorie goal to see what’s left.</p>
          </Card>

          <Card title="Macros" className="rise lg:col-span-2">
            <div className="space-y-4">
              {MACROS.map((m) => <MacroBar key={m.name} name={m.name} eaten={null} target={null} tone={m.tone} />)}
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
            {[
              { label: 'Burned', icon: <IconFlame size={18} className="text-important" />, value: '—' },
              { label: 'Water', icon: <IconDrop size={18} className="text-question" />, value: '—' },
              { label: 'Weight', icon: <IconScale size={18} className="text-task" />, value: '—' },
            ].map((s) => (
              <Card key={s.label} className="rise">
                <p className="label-caps mb-2 flex items-center gap-2">{s.icon}{s.label}</p>
                <p className="text-2xl font-semibold tabular-nums text-faint">{s.value}</p>
              </Card>
            ))}
          </div>

          <div className="space-y-4 lg:col-span-3">
            {MEALS.map((m) => (
              <Card key={m.id} title={m.label} aside="0 kcal" className="rise">
                <p className="text-sm text-faint">Nothing logged yet.</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
