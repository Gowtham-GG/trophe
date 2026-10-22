import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { rangeSummary } from '@/api/diary'
import { IconChevron } from '@/components/icons'
import { addDays, addMonths, formatFullDate, formatMonth, monthGrid } from '@/lib/dates'
import { fmtKcal } from '@/lib/nutrition'
import type { DayStatus, RangeDay } from '@/types/db'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

// one colour per verdict, the same everywhere: on target = teal, under = blue, over = amber
const DOT: Record<DayStatus, string> = { empty: '', logged: 'bg-faint', under: 'bg-question', on: 'bg-task', over: 'bg-important' }
const WORD: Record<DayStatus, string> = { empty: 'nothing logged', logged: 'logged', under: 'under target', on: 'on target', over: 'over target' }

function describe(key: string, d: RangeDay | undefined): string {
  if (!d || d.status === 'empty') return `${formatFullDate(key)}, nothing logged`
  return `${formatFullDate(key)}, ${fmtKcal(d.kcal)} kcal${d.goal_kcal ? ` of ${fmtKcal(d.goal_kcal)}` : ''}, ${WORD[d.status]}`
}

/** Month calendar of the diary: a dot per logged day, coloured by under / on / over the goal of that day. */
export function DiaryCalendar({ today, selected, onSelect }: { today: string; selected: string; onSelect: (key: string) => void }) {
  const [month, setMonth] = useState(() => addMonths(selected, 0))
  const [focusKey, setFocusKey] = useState(selected)
  const grid = monthGrid(month)
  const from = grid[0], to = grid[grid.length - 1]
  const gridRef = useRef<HTMLDivElement>(null)
  const moved = useRef(false)

  // keep the visible month in step when the selection jumps elsewhere (e.g. "Today", or the day arrows)
  useEffect(() => {
    if (selected.slice(0, 7) !== month.slice(0, 7)) setMonth(addMonths(selected, 0))
    setFocusKey(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusKey}"]`)?.focus()
  }, [focusKey, month])

  const q = useQuery({ queryKey: ['diary', 'range', from, to], queryFn: () => rangeSummary(from, to), placeholderData: (prev) => prev })
  const byDay = new Map((q.data ?? []).map((d) => [d.day, d]))

  const onKey = (e: KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (step === undefined) return
    e.preventDefault()
    const next = addDays(focusKey, step)
    moved.current = true
    if (next.slice(0, 7) !== month.slice(0, 7)) setMonth(addMonths(next, 0))
    setFocusKey(next)
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        <h3 className="flex-1 text-base font-semibold" aria-live="polite">{formatMonth(month)}</h3>
        {(month.slice(0, 7) !== today.slice(0, 7) || selected !== today) && (
          <button className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-hover hover:text-ink" onClick={() => { setMonth(addMonths(today, 0)); onSelect(today) }}>Today</button>
        )}
        <button aria-label="Previous month" className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink" onClick={() => setMonth(addMonths(month, -1))}>
          <IconChevron size={16} className="rotate-180" />
        </button>
        <button aria-label="Next month" className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink" onClick={() => setMonth(addMonths(month, 1))}>
          <IconChevron size={16} />
        </button>
      </div>

      <div ref={gridRef} role="grid" aria-label={formatMonth(month)} onKeyDown={onKey} className="grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((w) => <div key={w} role="columnheader" className="pb-1 text-[11px] font-medium uppercase tracking-wide text-faint">{w}</div>)}
        {grid.map((key) => {
          const d = byDay.get(key)
          const inMonth = key.slice(0, 7) === month.slice(0, 7)
          const isToday = key === today
          const isSel = key === selected
          const dot = d ? DOT[d.status] : ''
          return (
            <div key={key} role="gridcell" className="flex justify-center">
              <button
                data-day={key}
                tabIndex={key === focusKey ? 0 : -1}
                aria-label={describe(key, d)}
                aria-selected={isSel}
                aria-current={isToday ? 'date' : undefined}
                onClick={() => { setFocusKey(key); onSelect(key) }}
                className={[
                  'relative flex size-10 flex-col items-center justify-center rounded-full text-sm tabular-nums transition-colors focus-visible:rounded-full! focus-visible:outline-offset-1',
                  isSel ? 'bg-accent font-semibold text-on-accent' : isToday ? 'bg-accent-soft font-semibold text-accent' : 'hover:bg-hover',
                  !isSel && !inMonth ? 'text-faint opacity-60' : '',
                  key > today && !isSel ? 'text-faint' : '',
                ].join(' ')}
              >
                <span className="leading-none">{Number(key.slice(8))}</span>
                {dot && <span aria-hidden className={`absolute bottom-1 size-1.5 rounded-full ${isSel ? 'bg-on-accent' : dot}`} />}
              </button>
            </div>
          )
        })}
      </div>

      <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-faint" aria-hidden>
        {([['bg-task', 'On target'], ['bg-question', 'Under'], ['bg-important', 'Over'], ['bg-faint', 'No goal']] as const).map(([cls, label]) => (
          <span key={label} className="flex items-center gap-1"><span className={`size-1.5 rounded-full ${cls}`} />{label}</span>
        ))}
      </div>
    </div>
  )
}
