import { loggable } from '@/api/quickLine'
import { useSettings } from '@/contexts/SettingsContext'
import type { QuickCandidate } from '@/hooks/useQuickLine'
import { formatDayHeading } from '@/lib/dates'
import { MEALS } from '@/lib/meals'
import { describeAmount, fmtKcal, scale } from '@/lib/nutrition'
import type { QItem } from '@/lib/quickLog'
import { IconSearch, IconX } from './icons'

const HINT: Partial<Record<QItem['basis'], string>> = { last: 'as last time', measure: 'typical size', default: 'guessed, check it' }

/**
 * What a typed line will log: each food with its amount and calories, things it didn't recognise (tap to search),
 * and where it goes. Enter in the search box (or the button) logs it all.
 */
export function QuickLinePreview({ items, day, meal, busy, onDrop, onSearch, onLog }: {
  items: { key: string; item: QItem<QuickCandidate> }[]; day: string; meal: string; busy: boolean
  onDrop: (key: string) => void; onSearch: (query: string) => void; onLog: () => void
}) {
  const { timezone } = useSettings()
  const ok = items.filter((x) => loggable(x.item))
  const total = ok.reduce((sum, x) => sum + scale(x.item.food!, x.item.grams!).kcal, 0)
  return (
    <div className="mb-3 rounded-2xl border border-line bg-accent-soft px-3 py-2.5">
      <p className="label-caps mb-1.5 px-1">Quick add</p>
      <ul className="space-y-0.5">
        {items.map(({ key, item }) => (
          <li key={key} className="flex items-center gap-2 rounded-xl px-1 py-1">
            {item.food ? (
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.food.name}{item.food.ref.kind === 'dish' && <span className="font-normal text-faint"> · Indian dishes</span>}</span>
                <span className="block truncate text-xs text-muted">
                  {loggable(item) ? <>{describeAmount(item)} · {fmtKcal(scale(item.food, item.grams).kcal)} kcal</> : <span className="text-danger">That amount is too much to log</span>}
                  {HINT[item.basis] && <span className="text-faint"> · {HINT[item.basis]}</span>}
                </span>
              </span>
            ) : (
              <button onClick={() => onSearch(item.query)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm">
                <IconSearch size={15} className="shrink-0 text-faint" />
                <span className="truncate"><span className="text-muted">Not in your foods:</span> “{item.query}” <span className="text-accent">search</span></span>
              </button>
            )}
            <button onClick={() => onDrop(key)} aria-label={`Leave out ${item.food?.name ?? item.query}`} className="shrink-0 rounded-lg p-1.5 text-faint hover:bg-hover hover:text-ink"><IconX size={15} /></button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 px-1">
        <span className="mr-auto text-xs text-faint">{MEALS.find((m) => m.id === meal)?.label ?? meal} · {formatDayHeading(day, timezone)}</span>
        <button onClick={onLog} disabled={!ok.length || busy} className="bg-accent rounded-lg px-4 py-2 text-sm font-semibold text-on-accent">
          {busy ? 'Logging…' : `Log ${ok.length} item${ok.length === 1 ? '' : 's'} · ${fmtKcal(total)} kcal`}
        </button>
      </div>
    </div>
  )
}
