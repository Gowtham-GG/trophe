import { describe, expect, it } from 'vitest'
import { fmtClock, fmtDuration, fromLocalInput, toLocalInput } from './fasting'

describe('fasting helpers', () => {
  it('durations and clocks', () => {
    expect(fmtDuration(16 * 3600_000 + 5 * 60_000)).toBe('16 h 5 min')
    expect(fmtDuration(16 * 3600_000)).toBe('16 h')
    expect(fmtDuration(45 * 60_000)).toBe('45 min')
    expect(fmtDuration(51 * 3600_000)).toBe('2 d 3 h')
    expect(fmtDuration(-5)).toBe('0 min')
    expect(fmtClock(12 * 3600_000 + 4 * 60_000 + 9_000)).toBe('12:04:09')
    expect(fmtClock(30 * 3600_000)).toBe('30:00:00')
  })
  it('datetime-local values in the user’s timezone, both ways', () => {
    const at = new Date('2026-10-22T16:00:00Z')
    expect(toLocalInput(at, 'Asia/Kolkata')).toBe('2026-10-22T21:30')
    expect(fromLocalInput('2026-10-22T21:30', 'Asia/Kolkata')?.toISOString()).toBe('2026-10-22T16:00:00.000Z')
    expect(fromLocalInput('2026-03-29T03:30', 'Europe/London')?.toISOString()).toBe('2026-03-29T02:30:00.000Z') // after the clocks go forward
    expect(fromLocalInput('nope', 'UTC')).toBeNull()
  })
})
