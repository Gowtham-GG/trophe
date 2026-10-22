import { useState } from 'react'
import { useWidth } from '@/hooks/useWidth'
import { niceTicks } from '@/lib/chart'

export interface Column {
  key: string
  /** under the column ("5 Oct") */
  label: string
  /** tooltip / table heading ("Week of 5 Oct") */
  title: string
  value: number | null
  /** drawn as a short marker across the column */
  target?: number | null
  /** extra tooltip lines ("6 of 7 days logged") */
  lines?: string[]
}

const PAD = { l: 44, r: 8, t: 12, b: 26 }

/**
 * One series of columns from a zero baseline (≤ 24 px wide, 4 px rounded tops) with an optional target marker per
 * column. Each column is its own hover / focus target with a tooltip; a table view carries every value.
 */
export function ColumnChart({ data, unit, label, targetLabel = 'Goal', height = 200, fmt = (v: number) => v.toLocaleString('en-IN') }: {
  data: Column[]; unit: string; label: string; targetLabel?: string; height?: number; fmt?: (v: number) => string
}) {
  const [box, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const top = Math.max(1, ...data.flatMap((d) => [d.value ?? 0, d.target ?? 0]))
  const ticks = niceTicks(0, top, 4)
  const y1 = ticks[ticks.length - 1]
  const sy = (v: number) => PAD.t + (1 - v / y1) * (height - PAD.t - PAD.b)
  const slot = (w - PAD.l - PAD.r) / Math.max(1, data.length)
  const bw = Math.max(4, Math.min(24, slot * 0.6))
  const cx = (i: number) => PAD.l + slot * (i + 0.5)
  const every = Math.ceil(data.length / Math.max(1, Math.floor((w - PAD.l) / 56)))
  const hasTarget = data.some((d) => d.target != null)
  const h = hover != null ? data[hover] : null

  const column = (x: number, y: number) => {
    const base = sy(0), r = Math.min(4, (base - y) / 2, bw / 2)
    return `M${x - bw / 2},${base}V${y + r}Q${x - bw / 2},${y} ${x - bw / 2 + r},${y}H${x + bw / 2 - r}Q${x + bw / 2},${y} ${x + bw / 2},${y + r}V${base}Z`
  }

  return (
    <div>
      {hasTarget && (
        <div className="mb-2 flex gap-4 text-xs text-muted" aria-hidden>
          <span className="flex items-center gap-1.5"><svg width="10" height="10"><rect width="10" height="10" rx="2" fill="var(--accent)" /></svg>Average per day</span>
          <span className="flex items-center gap-1.5"><svg width="14" height="10"><path d="M1 5h12" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" /></svg>{targetLabel}</span>
        </div>
      )}
      <div ref={box} className="relative" role="group" aria-label={label}>
        <svg width={w} height={height} className="block" aria-hidden>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.l - 8} y={sy(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--faint)" className="tabular-nums">{t >= 1000 ? `${t / 1000}K` : t}</text>
            </g>
          ))}
          {data.map((d, i) => (
            <g key={d.key} opacity={hover != null && hover !== i ? 0.55 : 1}>
              {d.value != null && d.value > 0 && <path d={column(cx(i), sy(d.value))} fill="var(--accent)" />}
              {d.target != null && <line x1={cx(i) - bw / 2 - 3} x2={cx(i) + bw / 2 + 3} y1={sy(d.target)} y2={sy(d.target)} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" />}
              {i % every === 0 && <text x={cx(i)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--faint)">{d.label}</text>}
            </g>
          ))}
        </svg>
        {/* hit targets: the whole column slot, focusable, bigger than the bar */}
        {data.map((d, i) => (
          <button key={d.key} type="button" aria-label={`${d.title}: ${d.value != null ? `${fmt(d.value)} ${unit}` : 'nothing logged'}`}
            className="absolute rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
            style={{ left: cx(i) - slot / 2, width: slot, top: PAD.t, height: height - PAD.t - PAD.b }}
            onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
        ))}
        {h && hover != null && (
          <div className="glass-strong pointer-events-none absolute top-0 z-10 min-w-36 rounded-xl px-3 py-2 text-xs shadow-lg"
            style={cx(hover) > w / 2 ? { right: w - cx(hover) + slot / 2 + 4 } : { left: cx(hover) + slot / 2 + 4 }}>
            <p className="text-muted">{h.title}</p>
            <p className="text-sm font-semibold text-ink tabular-nums">{h.value != null ? `${fmt(h.value)} ${unit}` : 'Nothing logged'}</p>
            {h.target != null && <p className="text-muted tabular-nums">{targetLabel} {fmt(h.target)} {unit}</p>}
            {h.lines?.map((l) => <p key={l} className="text-muted tabular-nums">{l}</p>)}
          </div>
        )}
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-faint hover:text-muted">Show as a table</summary>
        <div className="mt-2 max-h-48 overflow-y-auto">
          <table className="w-full tabular-nums">
            <thead><tr className="text-left text-faint"><th className="py-1 font-normal">Period</th><th className="py-1 text-right font-normal">{unit}</th>{hasTarget && <th className="py-1 text-right font-normal">{targetLabel}</th>}<th className="py-1 text-right font-normal">Notes</th></tr></thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.key} className="border-t border-line">
                  <td className="py-1 text-muted">{d.title}</td><td className="py-1 text-right">{d.value != null ? fmt(d.value) : '—'}</td>
                  {hasTarget && <td className="py-1 text-right text-muted">{d.target != null ? fmt(d.target) : '—'}</td>}
                  <td className="py-1 text-right text-faint">{d.lines?.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
