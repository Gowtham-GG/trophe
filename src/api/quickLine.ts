import type { QuickCandidate } from '@/hooks/useQuickLine'
import { dishToExternal } from '@/lib/indian'
import type { QItem } from '@/lib/quickLog'
import { saveExternalFood } from './online'
import { diaryWriter, type Writer, type Written } from './writers'

/** An item the database will accept: a recognised food and an amount within the table's limits. */
export const loggable = (i: QItem<QuickCandidate>): i is QItem<QuickCandidate> & { food: QuickCandidate; grams: number } =>
  !!i.food && i.grams != null && i.grams > 0 && i.grams <= 5000 && (i.serving_qty == null || i.serving_qty <= 1000)

/** Log (or plan) a typed line: bundled dishes are copied into your foods first, then every item goes in one insert. */
export async function logQuickLine(items: QItem<QuickCandidate>[], day: string, meal: string, writer: Writer = diaryWriter): Promise<Written[]> {
  const ok = items.filter(loggable)
  const ids = await Promise.all(ok.map((i) => (i.food.ref.kind === 'mine' ? i.food.ref.id : saveExternalFood(dishToExternal(i.food.ref.dish)))))
  return writer.foods(ok.map((i, k) => ({ day, meal, food_id: ids[k], grams: i.grams, serving_label: i.serving_label, serving_qty: i.serving_qty })))
}
