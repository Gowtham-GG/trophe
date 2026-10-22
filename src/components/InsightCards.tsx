import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { insights } from '@/api/trends'
import { insightText } from '@/lib/insights'
import type { Insight } from '@/types/db'
import { IconCheck, IconInfo, IconX } from './icons'

const TONE: Record<Insight['tone'], { label: string; box: string; icon: string; Icon: typeof IconInfo }> = {
  warn: { label: 'Heads up', box: 'bg-important-soft', icon: 'text-important', Icon: IconInfo },
  note: { label: 'Worth knowing', box: 'bg-question-soft', icon: 'text-question', Icon: IconInfo },
  good: { label: 'Nice', box: 'bg-task-soft', icon: 'text-task', Icon: IconCheck },
}
const HIDDEN_KEY = 'trophe-insights-hidden'

// what was dismissed, for one day only (tomorrow's insights start fresh)
function readHidden(day: string): string[] {
  try { const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '{}') as { day?: string; kinds?: string[] }; return v.day === day ? v.kinds ?? [] : [] } catch { return [] }
}

/**
 * Insights about your last days (the database decides which apply). On Today: the first few, each dismissible for
 * the day. On Progress: all of them.
 */
export function InsightList({ today, limit, dismissible = false }: { today: string; limit?: number; dismissible?: boolean }) {
  const q = useQuery({ queryKey: ['diary', 'insights', today], queryFn: () => insights(today), staleTime: 5 * 60_000 })
  const [hidden, setHidden] = useState(() => readHidden(today))
  const hide = (kind: string) => {
    const next = [...hidden, kind]
    setHidden(next)
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify({ day: today, kinds: next })) } catch { /* private mode: hidden until reload */ }
  }
  const items = (q.data ?? [])
    .filter((i) => !(dismissible && hidden.includes(i.kind)))
    .map((i) => ({ i, t: insightText(i) }))
    .filter((x): x is { i: Insight; t: NonNullable<ReturnType<typeof insightText>> } => !!x.t)
    .slice(0, limit)
  if (!items.length) return null

  return (
    <ul className="space-y-2" aria-label="Insights">
      {items.map(({ i, t }) => {
        const tone = TONE[i.tone] ?? TONE.note
        return (
          <li key={i.kind} className={`rise flex gap-3 rounded-2xl px-4 py-3 ${tone.box}`}>
            <tone.Icon size={18} className={`mt-0.5 shrink-0 ${tone.icon}`} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{tone.label}</p>
              <p className="text-sm font-semibold">{t.title}</p>
              <p className="mt-0.5 text-sm text-muted">{t.body}</p>
              {t.link && <Link to={t.link.to} className="mt-1 inline-block text-sm font-medium">{t.link.label}</Link>}
            </div>
            {dismissible && (
              <button onClick={() => hide(i.kind)} aria-label={`Hide “${t.title}” for today`} className="-mr-1 self-start rounded-lg p-1 text-faint hover:bg-hover hover:text-ink"><IconX size={15} /></button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
