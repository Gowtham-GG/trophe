// Micronutrients: the ten Trophe keeps (see migration 15), how to show them, and a daily value to compare against.
// Daily values are the US FDA's (the most widely printed on labels); ICMR-NIN's Indian ones are close for adults.

export const MICROS = [
  { key: 'iron_mg', label: 'Iron', unit: 'mg', dv: 18 },
  { key: 'calcium_mg', label: 'Calcium', unit: 'mg', dv: 1300 },
  { key: 'potassium_mg', label: 'Potassium', unit: 'mg', dv: 4700 },
  { key: 'magnesium_mg', label: 'Magnesium', unit: 'mg', dv: 420 },
  { key: 'zinc_mg', label: 'Zinc', unit: 'mg', dv: 11 },
  { key: 'vitamin_a_ug', label: 'Vitamin A', unit: 'µg', dv: 900 },
  { key: 'vitamin_c_mg', label: 'Vitamin C', unit: 'mg', dv: 90 },
  { key: 'vitamin_d_ug', label: 'Vitamin D', unit: 'µg', dv: 20 },
  { key: 'vitamin_b12_ug', label: 'Vitamin B12', unit: 'µg', dv: 2.4 },
  { key: 'folate_ug', label: 'Folate', unit: 'µg', dv: 400 },
] as const

export type MicroKey = (typeof MICROS)[number]['key']
export type Micros = Partial<Record<MicroKey, number>>

/** Upper limits shown beside them: sugar and sodium are things to keep under. */
export const LIMITS = { sugar_g: 50, sodium_mg: 2300 } as const

/** 2.345 → "2.3", 480 → "480", 0.024 → "0.02": enough digits to mean something at each size. */
export function fmtMicro(n: number): string {
  const d = n >= 100 ? 0 : n >= 1 ? 1 : 2
  return (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('en-IN')
}

/** Only known keys with finite, non-negative values, rounded; null when nothing is left. */
export function cleanMicros(m: Record<string, unknown> | null | undefined): Micros | null {
  if (!m) return null
  const out: Micros = {}
  for (const { key } of MICROS) {
    const v = m[key]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100000) out[key] = Math.round(v * 1000) / 1000
  }
  return Object.keys(out).length ? out : null
}
