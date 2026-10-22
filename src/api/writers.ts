// Where the log dialog writes: the diary (logging) or the meal plan (planning). Same foods, amounts and saved meals;
// one interface, so the dialog doesn't care which.
import { deleteEntry, fetchDayEntries, logFoods, type FoodEntry } from './diary'
import { deletePlanItems, fetchPlan, planFoods, planTemplate } from './plan'
import { logTemplate } from './templates'

export interface Written { id: string; name: string; kcal: number }

export interface Writer {
  plan: boolean
  foods(entries: FoodEntry[]): Promise<Written[]>
  template(id: string, day: string, meal: string): Promise<number>
  remove(ids: string[]): Promise<void>
  /** the newest n items of a day's meal (what a saved meal just added): for Undo */
  newest(day: string, meal: string, n: number): Promise<string[]>
}

export const diaryWriter: Writer = {
  plan: false,
  foods: (entries) => logFoods(entries),
  template: (id, day, meal) => logTemplate(id, day, meal),
  remove: async (ids) => { await Promise.all(ids.map((id) => deleteEntry(id))) },
  newest: async (day, meal, n) => (await fetchDayEntries(day)).filter((e) => e.meal === meal)
    .sort((a, b) => b.logged_at.localeCompare(a.logged_at)).slice(0, n).map((e) => e.id),
}

export const planWriter: Writer = {
  plan: true,
  foods: async (entries) => (await planFoods(entries)).map((p) => ({ id: p.id, name: p.food.name, kcal: Math.round((p.food.kcal * p.grams) / 10) / 10 })),
  template: (id, day, meal) => planTemplate(id, day, meal),
  remove: (ids) => deletePlanItems(ids),
  newest: async (day, meal, n) => (await fetchPlan(day, day)).filter((p) => p.meal === meal)
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, n).map((p) => p.id),
}
