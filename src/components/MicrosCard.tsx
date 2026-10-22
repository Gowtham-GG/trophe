import { useQuery } from '@tanstack/react-query'
import { microsSummary } from '@/api/diary'
import { fmtMicro, LIMITS, MICROS } from '@/lib/micros'
import { Card } from './Card'

function Row({ label, value, unit, of, limit }: { label: string; value: number | null | undefined; unit: string; of: number; limit?: boolean }) {
  const v = value ?? 0
  const over = limit && v > of
  return (
    <li>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{value == null ? '—' : fmtMicro(v)} <span className="text-faint">/ {fmtMicro(of)} {unit}{limit ? ' limit' : ''}</span></span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-panel">
        <div className="h-full rounded-full" style={{ width: `${Math.min(v / of, 1) * 100}%`, background: over ? 'var(--important)' : limit ? 'var(--faint)' : 'var(--task)' }} />
      </div>
    </li>
  )
}

/**
 * Vitamins and minerals against a daily value, plus sugar and sodium against their limits: for one day (from = to)
 * or as the average per logged day of a range. Only foods that list them count, so it says how many did.
 */
export function MicrosCard({ from, to, collapsed = false }: { from: string; to: string; collapsed?: boolean }) {
  const q = useQuery({ queryKey: ['diary', 'micros', from, to], queryFn: () => microsSummary(from, to) })
  const s = q.data
  if (!s || s.entries === 0) return null
  const tracked = MICROS.filter((m) => s.micros[m.key] != null).length
  const range = from !== to

  const body = (
    <>
      <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {MICROS.map((m) => <Row key={m.key} label={m.label} value={s.micros[m.key]} unit={m.unit} of={m.dv} />)}
        <Row label="Sugar" value={s.sugar_g} unit="g" of={LIMITS.sugar_g} limit />
        <Row label="Sodium" value={s.sodium_mg} unit="mg" of={LIMITS.sodium_mg} limit />
      </ul>
      <p className="mt-3 text-[11px] text-faint">
        {s.with_micros === s.entries
          ? `Every logged item lists vitamins and minerals.`
          : `${s.with_micros} of ${s.entries} logged items list vitamins and minerals; the rest aren’t counted, so real amounts are higher.`}
        {' '}Daily values: US FDA.{range && ` Average per logged day (${s.logged_days}).`}
      </p>
    </>
  )

  return (
    <Card title="Micronutrients" aside={`${tracked} of ${MICROS.length} with data`} className="rise">
      {collapsed ? (
        <details>
          <summary className="cursor-pointer text-sm text-muted hover:text-ink">Show vitamins, minerals, sugar and sodium</summary>
          <div className="mt-3">{body}</div>
        </details>
      ) : body}
    </Card>
  )
}
