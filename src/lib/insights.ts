// How each insight reads. The database decides which apply (trophe.insights, migration 14) and hands over the
// numbers; this turns them into a title, a sentence and, sometimes, a link. Pure, unit-tested.
import type { Insight } from '@/types/db'
import { fmtKcal } from './nutrition'

export interface InsightText { title: string; body: string; link?: { label: string; to: string } }

const num = (d: Insight['data'], k: string) => Number(d[k])
const kgs = (n: number) => `${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`
const litres = (ml: number) => `${(ml / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })} l`

export function insightText(i: Insight): InsightText | null {
  const d = i.data
  switch (i.kind) {
    case 'protein_low':
      return {
        title: `Protein under target ${num(d, 'days')} of the last ${num(d, 'of')} days`,
        body: `You averaged ${num(d, 'avg')} g a day against ${num(d, 'goal')} g. Easy additions: a katori of dal or curd, paneer, eggs, sprouts, chicken.`,
      }
    case 'under_eating':
      return {
        title: 'Well under your calorie target',
        body: `${fmtKcal(num(d, 'avg'))} kcal a day this week against ${fmtKcal(num(d, 'goal'))}. Eating this far below is hard to keep up and costs muscle. If it isn’t on purpose, add a proper snack.`,
      }
    case 'losing_fast':
      return {
        title: 'Losing faster than planned',
        body: `Your trend is dropping ${kgs(num(d, 'rate'))} a week against a plan of ${kgs(num(d, 'pace'))}. That pace usually costs muscle and is hard to sustain; eating a little more is fine.`,
        link: { label: 'See your maintenance', to: '/progress' },
      }
    case 'trend_rising':
      return {
        title: 'Your weight trend is rising',
        body: `Up ${kgs(num(d, 'rate'))} a week while you’re aiming to lose ${kgs(num(d, 'pace'))}. Your real maintenance may be lower than your goal assumes.`,
        link: { label: 'See your maintenance', to: '/progress' },
      }
    case 'trend_falling':
      return {
        title: 'Your weight trend is falling',
        body: `Down ${kgs(num(d, 'rate'))} a week while you’re aiming to gain ${kgs(num(d, 'pace'))}. You may need a little more food.`,
        link: { label: 'See your maintenance', to: '/progress' },
      }
    case 'weekend_overshoot': {
      const diff = num(d, 'weekend') - num(d, 'weekday')
      return {
        title: `Weekends run ${fmtKcal(diff)} kcal higher`,
        body: `${fmtKcal(num(d, 'weekend'))} kcal on Saturdays and Sundays against ${fmtKcal(num(d, 'weekday'))} on weekdays over the last 4 weeks — about ${fmtKcal(diff * 2)} extra a week. Planning one weekend meal ahead helps.`,
      }
    }
    case 'fibre_low':
      return {
        title: 'Fibre is low',
        body: `${num(d, 'avg')} g a day against ${num(d, 'goal')} g. Whole dals, rajma, chana, vegetables and fruit add it quickly.`,
      }
    case 'water_low':
      return {
        title: 'Drinking less than your goal',
        body: `${litres(num(d, 'avg'))} a day on the days you logged water, against ${litres(num(d, 'goal'))}.`,
      }
    case 'missed_yesterday':
      return {
        title: 'Nothing logged yesterday',
        body: 'Add it while you remember — a rough estimate keeps your averages honest.',
        link: { label: 'Open yesterday', to: `/diary?day=${d.day}` },
      }
    case 'target_streak':
      return {
        title: `${num(d, 'days')} days on target in a row`,
        body: num(d, 'best') > num(d, 'days') ? `Your best is ${num(d, 'best')}. Keep it going.` : 'That’s your best run yet. Keep it going.',
      }
    case 'steady_week':
      return {
        title: 'A steady week',
        body: `${fmtKcal(num(d, 'avg'))} kcal a day on average, right on your ${fmtKcal(num(d, 'goal'))} target.`,
      }
    default:
      return null // a rule this version of the app doesn't know yet
  }
}
