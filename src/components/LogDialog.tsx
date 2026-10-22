import { useSettings } from '@/contexts/SettingsContext'
import { hourIn } from '@/lib/dates'
import { MEALS, mealForHour } from '@/lib/meals'
import { Dialog } from './Dialog'

/** Placeholder for the food logger (Phase 1): shows the meal it would log into, so the flow is visible already. */
export function LogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { timezone } = useSettings()
  const meal = MEALS.find((m) => m.id === mealForHour(hourIn(timezone)))!
  return (
    <Dialog open={open} onClose={onClose} title="Log food" closable>
      <p className="label-caps mb-1">Log to · {meal.label}</p>
      <h2 className="mb-3 text-xl font-semibold">What did you eat?</h2>
      <p className="mb-5 text-sm text-muted">Food search, servings and quick add arrive in Phase 1 and 2. This is where you’ll type “2 roti dal” and be done.</p>
      <div className="flex justify-end">
        <button className="bg-accent rounded-lg px-4 py-2 text-sm font-medium text-on-accent" onClick={onClose}>Got it</button>
      </div>
    </Dialog>
  )
}
