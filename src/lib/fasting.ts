// Fasting timer helpers: presets, durations and clock text. Pure, unit-tested.

/** Common schedules: hours fasting : hours eating. */
export const FAST_PRESETS = [
  { label: '12:12', hours: 12 },
  { label: '14:10', hours: 14 },
  { label: '16:8', hours: 16 },
  { label: '18:6', hours: 18 },
  { label: '20:4', hours: 20 },
  { label: 'OMAD 23:1', hours: 23 },
] as const

/** "16 h 5 min", "45 min", "2 d 3 h" (past a day). */
export function fmtDuration(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60_000))
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60
  if (d) return `${d} d ${h} h`
  if (h) return m ? `${h} h ${m} min` : `${h} h`
  return `${m} min`
}

/** "12:04:09": hours keep counting past 24. */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

/** A Date as the value of an <input type="datetime-local"> in the given timezone ("2026-10-22T21:30"). */
export function toLocalInput(date: Date, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(date).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

/** The instant a datetime-local value means in the given timezone (null when it isn't one). */
export function fromLocalInput(value: string, tz: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  // the zone's offset at that moment, found by formatting the guess back
  const shown = toLocalInput(new Date(guess), tz)
  const [, sy, smo, sd, sh, smi] = shown.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/)!.map(Number)
  const offset = Date.UTC(sy, smo - 1, sd, sh, smi) - guess
  return new Date(guess - offset)
}
