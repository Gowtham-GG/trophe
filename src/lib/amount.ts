// How much of a food: a quantity of one of its servings, or plain grams. Pure helpers for the pickers.
import type { FoodServing } from '@/types/db'

/** 'g' = grams; otherwise a serving id. */
export interface AmountState { unit: string; qty: number }

export interface ResolvedAmount { grams: number; serving_label: string | null; serving_qty: number | null }

export function resolveAmount(a: AmountState, servings: Pick<FoodServing, 'id' | 'label' | 'grams'>[]): ResolvedAmount | null {
  if (!Number.isFinite(a.qty) || a.qty <= 0) return null
  if (a.unit === 'g') return { grams: Math.round(a.qty * 10) / 10, serving_label: null, serving_qty: null }
  const s = servings.find((x) => x.id === a.unit)
  if (!s) return null
  return { grams: Math.round(s.grams * a.qty * 10) / 10, serving_label: s.label, serving_qty: a.qty }
}

/**
 * Where the picker starts: what you had last time (same serving if it still exists), else one of the
 * food's first serving, else 100 g.
 */
export function initialAmount(servings: Pick<FoodServing, 'id' | 'label' | 'grams'>[], last?: { grams: number | null; serving_label: string | null; serving_qty: number | null } | null): AmountState {
  if (last?.serving_label && last.serving_qty) {
    const s = servings.find((x) => x.label === last.serving_label)
    if (s) return { unit: s.id, qty: last.serving_qty }
  }
  if (last?.grams) return { unit: 'g', qty: last.grams }
  if (servings[0]) return { unit: servings[0].id, qty: 1 }
  return { unit: 'g', qty: 100 }
}

/** Parses "1.5", "1,5", "½", "1 ½" into a number (NaN when it isn't one). */
export function parseQty(raw: string): number {
  const t = raw.trim().replace(',', '.').replace(/\s*½/, '.5').replace(/\s*¼/, '.25').replace(/\s*¾/, '.75')
  return t === '' ? NaN : Number(t.startsWith('.') ? `0${t}` : t)
}
