import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchWater } from '@/api/body'
import { daySummary } from '@/api/diary'
import { bumpHabit, habitValue, mnemeHabits } from '@/api/links'
import { useSettings } from '@/contexts/SettingsContext'
import { HABIT_RULES, habitConditions, habitDelta } from '@/lib/links'

// which habit-days Trophe filled itself, so an Undo empties only what Trophe ticked (per device)
const TICKED_KEY = 'trophe-mneme-ticked'
const readTicked = (): string[] => { try { return JSON.parse(localStorage.getItem(TICKED_KEY) ?? '[]') as string[] } catch { return [] } }
const writeTicked = (l: string[]) => { try { localStorage.setItem(TICKED_KEY, JSON.stringify(l.slice(-200))) } catch { /* private mode */ } }

/**
 * Keeps the linked Mneme habits in step with the day: protein goal met, water goal met, food logged.
 * Runs on Today whenever its totals or water change; does nothing without links.
 */
export function useHabitSync(day: string) {
  const { links, waterGoal } = useSettings()
  const linked = HABIT_RULES.filter((r) => links.mneme?.[r.key])
  const on = linked.length > 0
  const summary = useQuery({ queryKey: ['diary', 'summary', day], queryFn: () => daySummary(day), enabled: on })
  const water = useQuery({ queryKey: ['water', day], queryFn: () => fetchWater(day), enabled: on })
  const habits = useQuery({ queryKey: ['mneme', 'habits'], queryFn: mnemeHabits, enabled: on, staleTime: 5 * 60_000 })
  const running = useRef<Promise<void>>(Promise.resolve())

  const s = summary.data
  const conditions = s && water.data ? habitConditions(
    { entries: s.totals.entries, protein_g: s.totals.protein_g, protein_goal: s.goal?.protein_g ?? null },
    water.data.reduce((sum, w) => sum + w.ml, 0), waterGoal) : null
  const signature = conditions && habits.data ? JSON.stringify([day, conditions, linked.map((r) => links.mneme?.[r.key])]) : null

  useEffect(() => {
    if (!signature || !conditions || !habits.data) return
    // one sync at a time, in order (quick taps never double-count)
    running.current = running.current.then(async () => {
      let ticked = readTicked()
      for (const rule of linked) {
        const habit = habits.data!.find((h) => h.id === links.mneme?.[rule.key])
        if (!habit) continue
        const key = `${habit.id}:${day}`
        const value = await habitValue(habit.id, day).catch(() => null)
        if (value == null) continue
        const delta = habitDelta(conditions[rule.key], value, habit.target, ticked.includes(key))
        if (!delta) continue
        await bumpHabit(habit.id, day, delta).catch(() => null)
        ticked = delta > 0 ? [...ticked.filter((k) => k !== key), key] : ticked.filter((k) => k !== key)
      }
      writeTicked(ticked)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the signature captures everything that matters
  }, [signature])
}
