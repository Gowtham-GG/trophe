import { describe, expect, it } from 'vitest'
import { insightText } from './insights'

describe('insightText', () => {
  it('words each rule with its numbers', () => {
    expect(insightText({ kind: 'protein_low', tone: 'warn', data: { days: 6, of: 6, avg: 90, goal: 130 } })?.title).toBe('Protein under target 6 of the last 6 days')
    expect(insightText({ kind: 'weekend_overshoot', tone: 'note', data: { weekend: 2400, weekday: 1900 } })).toMatchObject({
      title: 'Weekends run 500 kcal higher', body: expect.stringContaining('about 1,000 extra a week'),
    })
    expect(insightText({ kind: 'losing_fast', tone: 'warn', data: { rate: -1.38, pace: -0.5 } })?.body).toContain('dropping 1.38 kg a week against a plan of 0.5 kg')
    expect(insightText({ kind: 'water_low', tone: 'note', data: { avg: 583, goal: 2500 } })?.body).toBe('0.6 l a day on the days you logged water, against 2.5 l.')
  })
  it('links where there is something to do', () => {
    expect(insightText({ kind: 'missed_yesterday', tone: 'note', data: { day: '2026-10-28' } })?.link).toEqual({ label: 'Open yesterday', to: '/diary?day=2026-10-28' })
  })
  it('a streak says whether it is the best', () => {
    expect(insightText({ kind: 'target_streak', tone: 'good', data: { days: 5, best: 5 } })?.body).toContain('best run yet')
    expect(insightText({ kind: 'target_streak', tone: 'good', data: { days: 3, best: 9 } })?.body).toBe('Your best is 9. Keep it going.')
  })
  it('an unknown rule (a newer database) is skipped, not shown broken', () => {
    expect(insightText({ kind: 'something_new', tone: 'note', data: {} })).toBeNull()
  })
})
