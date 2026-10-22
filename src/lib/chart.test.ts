import { describe, expect, it } from 'vitest'
import { dateTicks, dayNumber, niceTicks, shortDate } from './chart'

describe('chart helpers', () => {
  it('round tick values that cover the range', () => {
    expect(niceTicks(78.3, 81.2)).toEqual([78, 79, 80, 81, 82])
    expect(niceTicks(0, 2140)).toEqual([0, 1000, 2000, 3000])
    expect(niceTicks(1450, 2380, 4)).toEqual([1000, 1500, 2000, 2500])
    expect(niceTicks(80, 80)).toEqual([79, 79.5, 80, 80.5, 81])
    expect(niceTicks(NaN, 3)).toEqual([])
  })
  it('date ticks: evenly spaced days, or month starts for long ranges', () => {
    expect(dateTicks('2026-10-01', '2026-10-29')).toEqual(['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29'])
    expect(dateTicks('2026-04-15', '2026-10-22')).toEqual(['2026-05-01', '2026-07-01', '2026-09-01'])
    expect(dateTicks('2026-10-01', '2026-10-01')).toEqual(['2026-10-01'])
  })
  it('day numbers and short labels', () => {
    expect(dayNumber('1970-01-02')).toBe(1)
    expect(dayNumber('2026-10-22') - dayNumber('2026-10-01')).toBe(21)
    expect(shortDate('2026-10-05')).toBe('5 Oct')
    expect(shortDate('2026-10-01', true)).toBe('Oct')
  })
})
