import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { quickLogFoods } from '@/api/foods'
import { useSettings } from '@/contexts/SettingsContext'
import { todayKey } from '@/lib/dates'
import { loadIndianDishes, type IndianDish } from '@/lib/indian'
import type { Per100 } from '@/lib/nutrition'
import { looksLikeQuickLog, parseQuickLog, type QFood, type QuickLog } from '@/lib/quickLog'

/** A food the typed line can match: one of yours, or a bundled dish that's copied into your foods when logged. */
export type QuickCandidate = QFood & Per100 & { ref: { kind: 'mine'; id: string } | { kind: 'dish'; dish: IndianDish } }

/**
 * "2 roti dal lunch" → the parsed line, once the text reads like quick logging and at least one food is recognised;
 * otherwise null (the text is an ordinary search).
 */
export function useQuickLine(text: string, enabled: boolean): QuickLog<QuickCandidate> | null {
  const { timezone } = useSettings()
  const foods = useQuery({ queryKey: ['foods', 'quick'], queryFn: quickLogFoods, enabled, staleTime: 60_000 })
  const dishes = useQuery({ queryKey: ['indian-dishes'], queryFn: loadIndianDishes, enabled, staleTime: Infinity, gcTime: Infinity })

  const candidates = useMemo(() => {
    if (!foods.data || !dishes.data) return null
    const byId = new Map(dishes.data.map((d) => [d.id, d]))
    const saved = new Set(foods.data.filter((f) => f.source === 'ifct').map((f) => f.external_id))
    const mine: QuickCandidate[] = foods.data.map((f) => ({
      ...f, tier: 0, ref: { kind: 'mine', id: f.id },
      // your copy of a bundled dish still answers to its other names
      aliases: f.source === 'ifct' && f.external_id ? byId.get(f.external_id)?.aliases : undefined,
    }))
    const suggested: QuickCandidate[] = dishes.data.filter((d) => !saved.has(d.id)).map((d) => ({ ...d, tier: 1, ref: { kind: 'dish', dish: d } }))
    return [...mine, ...suggested]
  }, [foods.data, dishes.data])

  return useMemo(() => {
    if (!enabled || !candidates || !looksLikeQuickLog(text)) return null
    const line = parseQuickLog(text, candidates, todayKey(timezone))
    return line.items.some((i) => i.food) ? line : null
  }, [enabled, candidates, text, timezone])
}
