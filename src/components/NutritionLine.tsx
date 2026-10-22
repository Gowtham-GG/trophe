import { fmtG, fmtKcal } from '@/lib/nutrition'

/** "238 kcal · P 8.8 · C 36.8 · F 6" — the one-line nutrition readout used in lists and previews. */
export function NutritionLine({ n, className = '' }: { n: { kcal: number; protein_g: number; carbs_g: number; fat_g: number }; className?: string }) {
  return (
    <span className={`tabular-nums ${className}`}>
      <b className="font-semibold text-ink">{fmtKcal(n.kcal)}</b> kcal
      <span className="text-faint"> · </span><span className="text-task">P</span> {fmtG(n.protein_g)}
      <span className="text-faint"> · </span><span className="text-accent">C</span> {fmtG(n.carbs_g)}
      <span className="text-faint"> · </span><span className="text-important">F</span> {fmtG(n.fat_g)}
    </span>
  )
}
