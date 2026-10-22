import { useEffect, useRef } from 'react'
import { canPopover } from '@/lib/effects'

export interface ConfirmOptions {
  /** small caps above the title: "Logged to Lunch" */
  kicker: string
  title: string
  detail?: string
  /** a short strip under the text: "Today 1,240 / 2,000 kcal" */
  stats?: { label: string; value: string }[]
  /** today's calorie ring, as fractions of the goal: it fills from `from` to `to` */
  ring?: { from: number; to: number }
  /** e.g. Undo; the only thing on the screen that doesn't just dismiss it */
  action?: { label: string; onClick: () => void }
}

const SIZE = 132, STROKE = 10, R = (SIZE - STROKE) / 2, C = 2 * Math.PI * R

/**
 * The full-screen moment after logging (Argus-style): a wash of the accent, today's ring filling to its new total
 * with a check, and the numbers. Any tap or key dismisses it; it also leaves on its own.
 */
export function Confirmation({ c, leaving, onDismiss }: { c: ConfirmOptions; leaving: boolean; onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (canPopover) ref.current?.showPopover()
    const onKey = (e: KeyboardEvent) => {
      // Escape would also close the log dialog underneath: this one only dismisses the confirmation
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation() }
      onDismiss()
    }
    window.addEventListener('keydown', onKey, true)
    navigator.vibrate?.([12, 40, 12])
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onDismiss])

  const over = (c.ring?.to ?? 0) > 1
  const offset = (f: number) => C * (1 - Math.min(Math.max(f, 0), 1))

  return (
    <div ref={ref} popover={canPopover ? 'manual' : undefined} onClick={onDismiss} role="status" aria-live="assertive"
      aria-label={`${c.kicker}: ${c.title}${c.detail ? `, ${c.detail}` : ''}`}
      className={`layer conf fixed inset-0 z-[60] flex cursor-pointer items-center justify-center ${leaving ? 'conf-leave' : ''}`}>
      <div className="conf-scrim absolute inset-0" aria-hidden />
      <div className="conf-flash absolute inset-0" aria-hidden />
      <div className="relative flex flex-col items-center px-6 text-center">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--panel)" strokeWidth={STROKE} />
          {c.ring && (
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={over ? 'var(--important)' : 'var(--accent)'} strokeWidth={STROKE} strokeLinecap="round"
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`} className="conf-ring"
              style={{ ['--c' as string]: C, ['--from' as string]: offset(c.ring.from), ['--to' as string]: offset(c.ring.to) }} />
          )}
          <path d="M44 67 l15 15 l30 -32" pathLength={1} fill="none" stroke="var(--ink)" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" className="conf-check" />
        </svg>
        <p className="conf-text mt-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-accent">{c.kicker}</p>
        <p className="conf-text conf-text-2 mt-2 max-w-md text-2xl font-semibold tracking-tight">{c.title}</p>
        {c.detail && <p className="conf-text conf-text-2 mt-1 text-sm text-muted">{c.detail}</p>}
        {!!c.stats?.length && (
          <div className="conf-text conf-text-3 mt-5 flex divide-x divide-line overflow-hidden rounded-xl border border-line bg-panel">
            {c.stats.map((s) => (
              <div key={s.label} className="px-4 py-2 text-left">
                <p className="text-[10px] uppercase tracking-[0.18em] text-muted">{s.label}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">{s.value}</p>
              </div>
            ))}
          </div>
        )}
        {c.action && (
          <button onClick={(e) => { e.stopPropagation(); c.action!.onClick(); onDismiss() }}
            className="conf-text conf-text-3 mt-5 rounded-full border border-line px-5 py-2 text-sm font-semibold text-ink hover:bg-hover">{c.action.label}</button>
        )}
      </div>
    </div>
  )
}
