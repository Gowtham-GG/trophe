import { useState } from 'react'
import { dateTicks, dayNumber, niceTicks, shortDate } from '@/lib/chart'
import { formatDayHeading } from '@/lib/dates'
import { useSettings } from '@/contexts/SettingsContext'
import { useWidth } from '@/hooks/useWidth'

export interface TrendDatum { day: string; value: number; trend?: number | null }

const PAD = { l: 40, r: 14, t: 14, b: 26 }

/**
 * Readings as dots (de-emphasised) with their smoothed trend as a 2px line, over [from, to]. Hover, touch or arrow
 * keys move a crosshair that snaps to the nearest reading; a table view carries every value without hovering.
 */
export function TrendChart({ data, from, to, unit, label, dotsLabel = 'Weigh-in', lineLabel = 'Trend', height = 220 }: {
  data: TrendDatum[]; from: string; to: string; unit: string; label: string; dotsLabel?: string; lineLabel?: string; height?: number
}) {
  const { timezone } = useSettings()
  const [box, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const hasTrend = data.some((d) => d.trend != null)

  const values = data.flatMap((d) => (d.trend != null ? [d.value, d.trend] : [d.value]))
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4)
  const y0 = ticks[0], y1 = ticks[ticks.length - 1]
  const x0 = dayNumber(from), x1 = dayNumber(to)
  const sx = (day: string) => PAD.l + ((dayNumber(day) - x0) / Math.max(1, x1 - x0)) * (w - PAD.l - PAD.r)
  const sy = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0 || 1)) * (height - PAD.t - PAD.b)
  const fmt = (v: number) => `${v.toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${unit}`
  const dense = data.length > 90

  const nearest = (px: number) => {
    let best = 0
    data.forEach((d, i) => { if (Math.abs(sx(d.day) - px) < Math.abs(sx(data[best].day) - px)) best = i })
    return best
  }
  const line = data.filter((d) => d.trend != null).map((d, i) => `${i ? 'L' : 'M'}${sx(d.day).toFixed(1)},${sy(d.trend!).toFixed(1)}`).join('')
  const h = hover != null ? data[hover] : null
  const longRange = x1 - x0 > 75

  return (
    <div>
      {hasTrend && (
        <div className="mb-2 flex gap-4 text-xs text-muted" aria-hidden>
          <span className="flex items-center gap-1.5"><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="var(--faint)" /></svg>{dotsLabel}</span>
          <span className="flex items-center gap-1.5"><svg width="16" height="10"><path d="M1 5h14" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" /></svg>{lineLabel}</span>
        </div>
      )}
      <div ref={box} className="relative touch-pan-y outline-none" tabIndex={0} role="img" aria-label={label}
        onPointerMove={(e) => setHover(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left))}
        onPointerLeave={() => setHover(null)} onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setHover((i) => Math.max(0, (i ?? data.length) - 1))
          else if (e.key === 'ArrowRight') setHover((i) => Math.min(data.length - 1, (i ?? -1) + 1))
          else if (e.key === 'Escape') setHover(null)
        }}>
        <svg width={w} height={height} className="block" aria-hidden>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={w - PAD.r} y1={sy(t)} y2={sy(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.l - 8} y={sy(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--faint)" className="tabular-nums">{t.toLocaleString('en-IN')}</text>
            </g>
          ))}
          {dateTicks(from, to).map((d) => (
            <text key={d} x={sx(d)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--faint)">{shortDate(d, longRange)}</text>
          ))}
          {h && <line x1={sx(h.day)} x2={sx(h.day)} y1={PAD.t} y2={height - PAD.b} stroke="var(--faint)" strokeWidth={1} />}
          {data.map((d, i) => (
            <circle key={d.day} cx={sx(d.day)} cy={sy(d.value)} r={i === hover ? 5 : dense ? 2.5 : 4}
              fill={hasTrend ? 'var(--faint)' : 'var(--accent)'} stroke="var(--bg)" strokeWidth={dense && i !== hover ? 1 : 2} />
          ))}
          {line && <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {h?.trend != null && <circle cx={sx(h.day)} cy={sy(h.trend)} r={4} fill="var(--accent)" stroke="var(--bg)" strokeWidth={2} />}
        </svg>
        {h && (
          <div className="glass-strong pointer-events-none absolute top-1 z-10 rounded-xl px-3 py-2 text-xs shadow-lg"
            style={sx(h.day) > w / 2 ? { right: w - sx(h.day) + 10 } : { left: sx(h.day) + 10 }}>
            <p className="text-muted">{formatDayHeading(h.day, timezone)}</p>
            <p className="text-sm font-semibold text-ink tabular-nums">{fmt(h.value)}</p>
            {h.trend != null && (
              <p className="flex items-center gap-1.5 text-muted tabular-nums">
                <svg width="12" height="6" aria-hidden><path d="M1 3h10" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" /></svg>{lineLabel} {fmt(h.trend)}
              </p>
            )}
          </div>
        )}
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-faint hover:text-muted">Show as a table</summary>
        <div className="mt-2 max-h-48 overflow-y-auto">
          <table className="w-full tabular-nums">
            <thead><tr className="text-left text-faint"><th className="py-1 font-normal">Day</th><th className="py-1 text-right font-normal">{dotsLabel}</th>{hasTrend && <th className="py-1 text-right font-normal">{lineLabel}</th>}</tr></thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.day} className="border-t border-line"><td className="py-1 text-muted">{d.day}</td><td className="py-1 text-right">{fmt(d.value)}</td>{hasTrend && <td className="py-1 text-right text-muted">{d.trend != null ? fmt(d.trend) : ''}</td>}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
