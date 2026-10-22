// Small, pure helpers for the inline SVG charts on Progress (no chart library in the bundle).
import { addDays, addMonths } from './dates'

/** Day number of a 'YYYY-MM-DD' key (days since 1970-01-01), for placing dates on an axis. */
export const dayNumber = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** Up to ~`count` round tick values (steps of 1, 2 or 5 × 10ⁿ) covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (min === max) { min -= 1; max += 1 }
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
  const ticks: number[] = []
  for (let v = Math.floor(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  if (ticks[ticks.length - 1] < max) ticks.push(Math.round((ticks[ticks.length - 1] + step) * 1e6) / 1e6)
  return ticks
}

/** Dates to label on an x-axis from `from` to `to`: month starts for long ranges, evenly spaced days otherwise. */
export function dateTicks(from: string, to: string, count = 5): string[] {
  const span = dayNumber(to) - dayNumber(from)
  if (span <= 0) return [from]
  if (span > 75) {
    const months: string[] = []
    for (let m = addMonths(from, from.endsWith('-01') ? 0 : 1); m <= to; m = addMonths(m, 1)) months.push(m)
    const every = Math.ceil(months.length / count)
    return months.filter((_, i) => i % every === 0)
  }
  const step = Math.max(1, Math.round(span / (count - 1)))
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, step)) out.push(d)
  return out
}

/** "12 Oct", or "Oct" / "Oct 2026" for a month start. */
export function shortDate(key: string, month = false): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...(month ? { month: 'short' } : { day: 'numeric', month: 'short' }) }).format(new Date(Date.UTC(y, m - 1, d)))
}
