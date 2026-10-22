// The default meal slots, in the order a day is eaten. Phase 1 lets users rename / add their own.
export const MEALS = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'snacks', label: 'Snacks' },
  { id: 'dinner', label: 'Dinner' },
] as const

export type MealId = (typeof MEALS)[number]['id']

/** The meal that fits the time of day (hour 0–23 in the user's timezone): what "＋ Log" preselects. */
export function mealForHour(hour: number): MealId {
  if (hour >= 4 && hour < 11) return 'breakfast'
  if (hour >= 11 && hour < 16) return 'lunch'
  if (hour >= 16 && hour < 19) return 'snacks'
  return 'dinner'
}
