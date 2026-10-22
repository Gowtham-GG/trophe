import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { currentFast } from '@/api/fasting'
import { useNow } from '@/hooks/useNow'
import { fmtDuration } from '@/lib/fasting'
import { IconClock } from './icons'

/** On Today while a fast is running: how long so far, against its target. Opens the Fasting page. */
export function FastingBanner() {
  const fast = useQuery({ queryKey: ['fasts', 'current'], queryFn: currentFast })
  const now = useNow(30_000)
  const f = fast.data
  if (!f) return null
  const elapsed = now - new Date(f.started_at).getTime()
  const target = f.target_hours * 3600_000
  return (
    <Link to="/fasting" className="rise flex items-center gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-ink no-underline hover:no-underline">
      <IconClock size={18} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1 text-sm">
        <b className="font-semibold">Fasting {fmtDuration(elapsed)}</b>
        <span className="text-muted"> · {elapsed >= target ? 'target reached' : `${fmtDuration(target - elapsed)} to ${f.target_hours} h`}</span>
      </span>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-panel" aria-hidden>
        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(elapsed / target, 1) * 100}%` }} />
      </span>
    </Link>
  )
}
