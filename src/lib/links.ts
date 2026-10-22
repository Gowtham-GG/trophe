// Links to the sibling apps: which Mneme habits Trophe ticks, and which Argus categories are food. Pure, unit-tested.

export type HabitRule = 'protein' | 'water' | 'logged'

export interface Links {
  mneme?: Partial<Record<HabitRule, string | null>>
  argus?: { food_categories?: string[] }
}

export const HABIT_RULES: { key: HabitRule; label: string }[] = [
  { key: 'protein', label: 'Protein goal met' },
  { key: 'water', label: 'Water goal met' },
  { key: 'logged', label: 'Logged food today' },
]

/** Which conditions hold for the day; null when it can't be told (no protein goal set). */
export function habitConditions(day: { entries: number; protein_g: number; protein_goal: number | null }, waterMl: number, waterGoal: number): Record<HabitRule, boolean | null> {
  return {
    protein: day.protein_goal ? day.protein_g >= day.protein_goal : null,
    water: waterMl >= waterGoal,
    logged: day.entries > 0,
  }
}

/**
 * How much to move a Mneme habit by: a met condition fills it to its target; one that stops being met (an Undo)
 * empties it again — but only if Trophe was the one that filled it and nobody changed it since.
 */
export function habitDelta(met: boolean | null, value: number, target: number, tickedByTrophe: boolean): number {
  if (met === null) return 0
  if (met) return value < target ? target - value : 0
  return tickedByTrophe && value === target ? -target : 0
}
