import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ruleMessage } from '@/api/errors'
import { currentFast, deleteFast, fastingStats, lastLoggedAt, listFasts, startFast, updateFast } from '@/api/fasting'
import { Card } from '@/components/Card'
import { Ring } from '@/components/Ring'
import { IconX } from '@/components/icons'
import { useSettings } from '@/contexts/SettingsContext'
import { useToast } from '@/contexts/ToastContext'
import { useNow } from '@/hooks/useNow'
import { formatDayHeading, dayKey, formatTime } from '@/lib/dates'
import { FAST_PRESETS, fmtClock, fmtDuration, fromLocalInput, toLocalInput } from '@/lib/fasting'
import type { Fast } from '@/types/db'

const TARGET_KEY = 'trophe-fast-target'
const storedTarget = () => { try { const n = Number(localStorage.getItem(TARGET_KEY)); return n >= 1 && n <= 72 ? n : 16 } catch { return 16 } }

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-panel px-3 py-2"><p className="text-xs text-muted">{label}</p><p className="text-lg font-semibold">{value}</p></div>
}

function Presets({ value, onChange }: { value: number; onChange: (h: number) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-1.5" role="radiogroup" aria-label="Fasting schedule">
      {FAST_PRESETS.map((p) => (
        <button key={p.hours} role="radio" aria-checked={value === p.hours} onClick={() => onChange(p.hours)}
          className={`rounded-full px-3 py-1 text-sm ${value === p.hours ? 'bg-accent text-on-accent font-semibold' : 'bg-panel text-muted hover:bg-hover hover:text-ink'}`}>{p.label}</button>
      ))}
    </div>
  )
}

function Running({ fast }: { fast: Fast }) {
  const { timezone: tz } = useSettings()
  const { toast, confirm } = useToast()
  const qc = useQueryClient()
  const now = useNow()
  const [editing, setEditing] = useState(false)
  const [start, setStart] = useState(() => toLocalInput(new Date(fast.started_at), tz))
  const started = new Date(fast.started_at).getTime()
  const elapsed = now - started
  const target = fast.target_hours * 3600_000
  const ends = new Date(started + target)
  const refresh = () => void qc.invalidateQueries({ queryKey: ['fasts'] })
  const when = (d: Date) => `${dayKey(d, tz) === dayKey(new Date(now), tz) ? '' : `${formatDayHeading(dayKey(d, tz), tz)} `}${formatTime(d.toISOString(), tz)}`

  const end = async () => {
    try {
      await updateFast(fast.id, { ended_at: new Date().toISOString() })
      refresh()
      confirm({ kicker: elapsed >= target ? 'Fast complete' : 'Fast ended', title: fmtDuration(elapsed), detail: `target ${fast.target_hours} h`,
        ring: { from: 0, to: elapsed / target } })
    } catch (err) { toast(ruleMessage(err, 'Couldn’t end the fast.'), { kind: 'error' }) }
  }
  const saveStart = async () => {
    const d = fromLocalInput(start, tz)
    if (!d || d.getTime() > Date.now()) return toast('The start can’t be in the future.', { kind: 'error' })
    try { await updateFast(fast.id, { started_at: d.toISOString() }); refresh(); setEditing(false) } catch (err) { toast(ruleMessage(err, 'Couldn’t change the start.'), { kind: 'error' }) }
  }
  const cancel = async () => {
    try { await deleteFast(fast.id); refresh(); toast('Fast cancelled') } catch { toast('Couldn’t cancel the fast.', { kind: 'error' }) }
  }

  return (
    <div className="flex flex-col items-center text-center">
      <Ring value={elapsed / target} size={220} stroke={16} label={`Fasting for ${fmtDuration(elapsed)} of ${fast.target_hours} hours`}>
        <span className="text-4xl font-bold tabular-nums">{fmtClock(elapsed)}</span>
        <span className="text-xs text-muted">{elapsed >= target ? `target reached · +${fmtDuration(elapsed - target)}` : `${fmtDuration(target - elapsed)} to go`}</span>
      </Ring>
      <p className="mt-4 text-sm text-muted">Started {when(new Date(started))} · {fast.target_hours} h ends {when(ends)}</p>
      <div className="mt-4"><Presets value={fast.target_hours} onChange={(h) => void updateFast(fast.id, { target_hours: h }).then(refresh)} /></div>
      {editing ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Fast started at" className="field w-auto" />
          <button onClick={() => void saveStart()} className="bg-accent rounded-lg px-4 py-2 text-sm font-semibold text-on-accent">Save</button>
          <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-2 text-sm hover:bg-hover">Cancel</button>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button onClick={() => void end()} className="bg-accent rounded-lg px-6 py-2.5 text-sm font-semibold text-on-accent">End fast</button>
          <button onClick={() => setEditing(true)} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-hover">Change start</button>
          <button onClick={() => void cancel()} className="rounded-lg px-4 py-2.5 text-sm text-muted hover:bg-hover hover:text-ink">Cancel fast</button>
        </div>
      )}
    </div>
  )
}

function NotRunning() {
  const { timezone: tz } = useSettings()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [target, setTarget] = useState(storedTarget)
  const last = useQuery({ queryKey: ['fasts', 'last-log'], queryFn: lastLoggedAt })
  const now = useNow(60_000)
  const lastMeal = last.data && now - new Date(last.data).getTime() < 24 * 3600_000 ? new Date(last.data) : null
  const choose = (h: number) => { setTarget(h); try { localStorage.setItem(TARGET_KEY, String(h)) } catch { /* private mode */ } }
  const start = async (at: Date) => {
    try { await startFast(at, target); void qc.invalidateQueries({ queryKey: ['fasts'] }) } catch (err) { toast(ruleMessage(err, 'Couldn’t start the fast.'), { kind: 'error' }) }
  }
  return (
    <div className="flex flex-col items-center text-center">
      <Ring value={0} size={220} stroke={16} label="Not fasting">
        <span className="text-4xl font-bold">{target} h</span>
        <span className="text-xs text-muted">fast, {24 - target > 0 ? `${24 - target} h eating window` : 'one meal a day'}</span>
      </Ring>
      <div className="mt-5"><Presets value={target} onChange={choose} /></div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button onClick={() => void start(new Date())} className="bg-accent rounded-lg px-6 py-2.5 text-sm font-semibold text-on-accent">Start now</button>
        {lastMeal && <button onClick={() => void start(lastMeal)} className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-hover">From my last meal ({formatTime(lastMeal.toISOString(), tz)})</button>}
      </div>
    </div>
  )
}

/** Fasting: a timer for the current fast (or presets to start one), the last 30 days in numbers, and history. */
export function Fasting() {
  const { timezone: tz } = useSettings()
  const { toast } = useToast()
  const qc = useQueryClient()
  const current = useQuery({ queryKey: ['fasts', 'current'], queryFn: currentFast })
  const history = useQuery({ queryKey: ['fasts', 'history'], queryFn: () => listFasts(20) })
  const stats = useQuery({ queryKey: ['fasts', 'stats'], queryFn: fastingStats })
  const s = stats.data

  const remove = async (f: Fast) => {
    try { await deleteFast(f.id); void qc.invalidateQueries({ queryKey: ['fasts'] }) } catch { toast('Couldn’t delete that fast.', { kind: 'error' }) }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-top mx-auto max-w-2xl space-y-4 px-4 pb-32 lg:px-6 lg:pb-8">
        <h1 className="text-[28px] font-semibold leading-tight">Fasting</h1>
        <Card className="rise py-8">
          {current.isLoading ? <div className="skeleton mx-auto h-56 w-56 rounded-full" /> : current.data ? <Running key={current.data.id} fast={current.data} /> : <NotRunning />}
        </Card>

        {s && s.count > 0 && (
          <Card title="Last 30 days" className="rise">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Fasts" value={String(s.count)} />
              <Stat label="Reached target" value={`${s.reached} of ${s.count}`} />
              <Stat label="Average" value={s.avg_hours != null ? `${s.avg_hours} h` : '—'} />
              <Stat label="Longest" value={s.longest_hours != null ? `${s.longest_hours} h` : '—'} />
            </div>
          </Card>
        )}

        {!!history.data?.length && (
          <Card title="History" className="rise">
            <ul className="space-y-2">
              {history.data.map((f) => {
                const ms = new Date(f.ended_at!).getTime() - new Date(f.started_at).getTime()
                const reached = ms >= f.target_hours * 3600_000
                return (
                  <li key={f.id} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-sm text-muted">{formatDayHeading(dayKey(f.started_at, tz), tz)}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-panel" aria-hidden>
                      <span className="block h-full rounded-full" style={{ width: `${Math.min(ms / (f.target_hours * 3600_000), 1) * 100}%`, background: reached ? 'var(--accent)' : 'var(--faint)' }} />
                    </span>
                    <span className="w-28 shrink-0 text-right text-sm tabular-nums">{fmtDuration(ms)} <span className="text-faint">/ {f.target_hours} h</span></span>
                    <button onClick={() => void remove(f)} aria-label={`Delete the fast of ${formatDayHeading(dayKey(f.started_at, tz), tz)}`} className="rounded-lg p-1 text-faint hover:bg-hover hover:text-ink"><IconX size={14} /></button>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
        <p className="px-1 text-[11px] text-faint">Fasting isn’t right for everyone — skip it if you’re pregnant, diabetic, underweight or have had an eating disorder, and ask a doctor if unsure.</p>
      </div>
    </div>
  )
}
