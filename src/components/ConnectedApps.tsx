import { useQuery } from '@tanstack/react-query'
import { argusCategories, mnemeHabits } from '@/api/links'
import { useSettings } from '@/contexts/SettingsContext'
import { useToast } from '@/contexts/ToastContext'
import { HABIT_RULES, type HabitRule, type Links } from '@/lib/links'
import { Card } from './Card'

/** Settings → Connected apps: Mneme habits Trophe ticks for you, and Argus categories that count as food. */
export function ConnectedApps() {
  const { links, update } = useSettings()
  const { toast } = useToast()
  const habits = useQuery({ queryKey: ['mneme', 'habits'], queryFn: mnemeHabits, staleTime: 5 * 60_000 })
  const categories = useQuery({ queryKey: ['argus', 'categories'], queryFn: argusCategories, staleTime: 5 * 60_000 })
  const save = (next: Links) => void update({ links: next }).catch(() => toast('Couldn’t save that.', { kind: 'error' }))
  const setHabit = (rule: HabitRule, id: string) => save({ ...links, mneme: { ...links.mneme, [rule]: id || null } })
  const food = links.argus?.food_categories ?? []
  const habitList = habits.data
  const toggle = (id: string) => save({ ...links, argus: { ...links.argus, food_categories: food.includes(id) ? food.filter((x) => x !== id) : [...food, id] } })

  return (
    <Card title="Connected apps">
      <p className="mb-4 text-sm text-muted">Trophe shares your sign-in with Mneme and Argus, so it can work with them. Nothing is shared with anyone else.</p>

      <h3 className="mb-1 text-sm font-semibold">Mneme habits</h3>
      {habits.isLoading ? <div className="skeleton h-10" /> : !habitList ? (
        <p className="mb-4 text-sm text-faint">Mneme isn’t set up for this account (or its data isn’t reachable).</p>
      ) : (
        <div className="mb-4">
          <p className="mb-2 text-xs text-muted">Ticked automatically on Today when it happens, and unticked if you undo it.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {HABIT_RULES.map((r) => (
              <label key={r.key} className="block"><span className="mb-1 block text-xs text-muted">{r.label}</span>
                <select value={links.mneme?.[r.key] ?? ''} onChange={(e) => setHabit(r.key, e.target.value)} className="field">
                  <option value="">Don’t tick a habit</option>
                  {habitList.map((h) => <option key={h.id} value={h.id}>{h.name}{h.target > 1 ? ` (${h.target}${h.unit ? ` ${h.unit}` : ''})` : ''}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      <h3 className="mb-1 text-sm font-semibold">Argus food spending</h3>
      {categories.isLoading ? <div className="skeleton h-10" /> : !categories.data ? (
        <p className="text-sm text-faint">Argus isn’t set up for this account (or its data isn’t reachable).</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted">Which expense categories are food? Progress shows what you spend on them, and per 1,000 kcal eaten. Read-only.</p>
          <div className="flex flex-wrap gap-1.5">
            {categories.data.map((c) => (
              <button key={c.id} onClick={() => toggle(c.id)} aria-pressed={food.includes(c.id)}
                className={`rounded-full px-3 py-1 text-sm ${food.includes(c.id) ? 'bg-accent text-on-accent font-semibold' : 'bg-panel text-muted hover:bg-hover hover:text-ink'}`}>{c.name}</button>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
