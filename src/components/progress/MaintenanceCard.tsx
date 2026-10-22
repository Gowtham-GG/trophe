import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ruleMessage } from '@/api/errors'
import { goalFor, maintenanceEstimate, saveGoal } from '@/api/goals'
import { useSettings } from '@/contexts/SettingsContext'
import { useToast } from '@/contexts/ToastContext'
import { shortDate } from '@/lib/chart'
import { fmtKcal, KCAL_PER_KG, macroTargets, minKcal, rescaleGoal } from '@/lib/nutrition'
import type { MaintenanceEstimate } from '@/types/db'
import { Card } from '../Card'

const PACES = [-0.75, -0.5, -0.25, 0, 0.25, 0.5]
const paceLabel = (p: number) => (p === 0 ? 'Maintain' : `${p < 0 ? 'Lose' : 'Gain'} ${Math.abs(p)}`)
const CONFIDENCE: Record<MaintenanceEstimate['confidence'], string> = {
  none: '', low: 'doesn’t add up', medium: 'rough', high: 'solid',
}

function Needs({ m }: { m: MaintenanceEstimate }) {
  return (
    <ul className="mt-2 space-y-1 text-sm text-muted">
      {m.needs.map((n) => (
        <li key={n.kind}>· {n.kind === 'log'
          ? `Log food on ${n.count} more of the last ${m.days} days (${m.logged_days} so far).`
          : n.count > 0 ? `Weigh in ${n.count} more time${n.count === 1 ? '' : 's'}, spread over at least two weeks.` : `Keep weighing in: your weigh-ins need to span two weeks (${n.span} days so far).`}
        </li>
      ))}
    </ul>
  )
}

/**
 * Maintenance measured from your own last 4 weeks (what you ate against how your weight trend moved), and the
 * target that gives your chosen pace. Nothing changes until "Use" is tapped: that starts a new goal today.
 */
export function MaintenanceCard({ today }: { today: string }) {
  const { profile } = useSettings()
  const { toast, confirm } = useToast()
  const qc = useQueryClient()
  const est = useQuery({ queryKey: ['maintenance', today], queryFn: () => maintenanceEstimate(today) })
  const goal = useQuery({ queryKey: ['goals', today], queryFn: () => goalFor(today) })
  const [picked, setPicked] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const m = est.data
  if (!m) return null

  const pace = picked ?? m.pace_kg_week
  const floor = minKcal(profile.sex ?? 'female')
  const suggested = m.estimate_kcal != null && pace != null ? Math.max(Math.round((m.estimate_kcal + (pace * KCAL_PER_KG) / 7) / 10) * 10, floor) : null
  const usable = m.confidence === 'medium' || m.confidence === 'high'
  const current = goal.data

  const use = async () => {
    if (suggested == null || pace == null) return
    setBusy(true)
    try {
      // keep the goal's protein and fat; without a goal yet, split it like the goal wizard does
      const kg = m.trend_to?.trend ?? 70
      const macros = current ? rescaleGoal(current, suggested) : { kcal: suggested, ...macroTargets(suggested, kg, 1.6, 25) }
      await saveGoal({ effective_from: today, ...macros, pace_kg_week: pace })
      for (const key of ['diary', 'goals', 'maintenance']) void qc.invalidateQueries({ queryKey: [key] })
      confirm({ kicker: 'New goal from today', title: `${fmtKcal(suggested)} kcal a day`, detail: `${paceLabel(pace)}${pace ? ' kg a week' : ''}`,
        stats: [{ label: 'Protein', value: `${macros.protein_g} g` }, { label: 'Carbs', value: `${macros.carbs_g} g` }, { label: 'Fat', value: `${macros.fat_g} g` }] })
      setPicked(null)
    } catch (err) { toast(ruleMessage(err, 'Couldn’t save the goal.'), { kind: 'error' }) } finally { setBusy(false) }
  }

  return (
    <Card title="Your maintenance" aside={m.confidence !== 'none' && `${CONFIDENCE[m.confidence]} estimate`} className="rise">
      {m.confidence === 'none' ? (
        <>
          <p className="text-sm text-muted">Trophe can measure the calories you actually burn from what you eat and how your weight trend moves — no formula guesses. It needs a little more data:</p>
          <Needs m={m} />
        </>
      ) : (
        <>
          <p className="text-3xl font-bold">≈ {fmtKcal(m.estimate_kcal!)} <span className="text-base font-normal text-muted">kcal a day</span></p>
          <p className="mt-1 text-sm text-muted">
            Over {shortDate(m.from)} – {shortDate(m.to)} you ate {fmtKcal(m.avg_kcal!)} kcal a day on average ({m.logged_days} of {m.days} days logged)
            {' '}and your trend went {m.trend_from!.trend} → {m.trend_to!.trend} kg ({m.change_kg! > 0 ? '+' : m.change_kg! < 0 ? '−' : '±'}{Math.abs(m.change_kg!)} kg).
          </p>
          {m.confidence === 'low' ? (
            <p className="mt-3 rounded-xl bg-important-soft px-3 py-2 text-sm">That number doesn’t look like a real maintenance, so there’s no suggestion. Usually some meals or drinks aren’t logged; log everything for a couple of weeks and it settles.</p>
          ) : (
            <>
              <p className="mb-2 mt-4 text-xs text-muted">Your pace (kg a week)</p>
              <div className="flex flex-wrap gap-1.5">
                {PACES.map((p) => (
                  <button key={p} onClick={() => setPicked(p)} aria-pressed={pace === p}
                    className={`rounded-full px-3 py-1 text-sm ${pace === p ? 'bg-accent text-on-accent font-semibold' : 'bg-panel text-muted hover:bg-hover hover:text-ink'}`}>{paceLabel(p)}</button>
                ))}
              </div>
              {suggested != null ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-panel px-4 py-3">
                  <p className="text-sm">
                    Suggested target <b className="text-lg">{fmtKcal(suggested)} kcal</b>
                    {current && <span className="text-muted"> · now {fmtKcal(current.kcal)}</span>}
                  </p>
                  {current?.kcal === suggested && pace === current.pace_kg_week
                    ? <span className="ml-auto text-xs text-muted">Your goal already matches.</span>
                    : <button onClick={() => void use()} disabled={busy || !usable} className="bg-accent ml-auto rounded-lg px-4 py-2 text-sm font-semibold text-on-accent">{busy ? 'Saving…' : `Use ${fmtKcal(suggested)} from today`}</button>}
                </div>
              ) : <p className="mt-3 text-sm text-faint">Pick a pace to see the target that fits it.</p>}
              {suggested === floor && <p className="mt-2 text-xs text-important">That’s the lowest target Trophe suggests; a slower pace is safer.</p>}
            </>
          )}
          <p className="mt-3 text-[11px] text-faint">Measured from the 4 weeks before today, ~7,700 kcal per kg. It updates as you log; your goal only changes when you tap Use. Check in every week or two.</p>
        </>
      )}
    </Card>
  )
}
