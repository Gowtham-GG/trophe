import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ruleMessage } from '@/api/errors'
import { goalFor, latestWeighIn, saveGoal, saveWeighIn } from '@/api/goals'
import { useSettings } from '@/contexts/SettingsContext'
import { useToast } from '@/contexts/ToastContext'
import { todayKey } from '@/lib/dates'
import { ACTIVITY, ageIn, macroTargets, minKcal, targetKcal, tdee } from '@/lib/nutrition'
import type { Activity, Sex } from '@/types/db'
import { Dialog } from './Dialog'

const PACES: { value: number; label: string }[] = [
  { value: -0.75, label: 'Lose 0.75 kg / week' },
  { value: -0.5, label: 'Lose 0.5 kg / week' },
  { value: -0.25, label: 'Lose 0.25 kg / week' },
  { value: 0, label: 'Maintain' },
  { value: 0.25, label: 'Gain 0.25 kg / week' },
  { value: 0.5, label: 'Gain 0.5 kg / week' },
]

const n = (s: string) => Number(s.replace(',', '.'))

/**
 * Works out a daily target from your body and pace (Mifflin–St Jeor × activity, ±7700 kcal per kg), splits it
 * into macros, and lets you overrule any number before saving. The goal starts today: past days keep theirs.
 */
export function GoalWizard({ onClose }: { onClose: () => void }) {
  const { timezone, profile, update } = useSettings()
  const { toast } = useToast()
  const qc = useQueryClient()
  const today = todayKey(timezone)
  const weight = useQuery({ queryKey: ['weigh-ins', 'latest'], queryFn: latestWeighIn })
  const current = useQuery({ queryKey: ['goals', today], queryFn: () => goalFor(today) })

  const [sex, setSex] = useState<Sex>(profile.sex ?? 'male')
  const [birthYear, setBirthYear] = useState(profile.birth_year ? String(profile.birth_year) : '')
  const [height, setHeight] = useState(profile.height_cm ? String(profile.height_cm) : '')
  const [kg, setKg] = useState<string | null>(null) // null until the user types: then the latest weigh-in shows
  const [activity, setActivity] = useState<Activity>(profile.activity ?? 'light')
  const [pace, setPace] = useState(-0.5)
  const [proteinPerKg, setProteinPerKg] = useState(1.6)
  const [fatPct, setFatPct] = useState(25)
  const [custom, setCustom] = useState<Record<'kcal' | 'protein_g' | 'carbs_g' | 'fat_g', string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const kgText = kg ?? (weight.data ? String(weight.data.kg) : '')
  const age = birthYear ? ageIn(n(birthYear), today) : NaN
  const bodyOk = n(kgText) >= 20 && n(kgText) <= 400 && n(height) >= 50 && n(height) <= 272 && age >= 13 && age <= 110
  const maintenance = bodyOk ? tdee(sex, n(kgText), n(height), age, activity) : null
  const target = maintenance ? targetKcal(maintenance, pace, sex) : null
  const macros = target ? macroTargets(target.kcal, n(kgText), proteinPerKg, fatPct) : null
  const suggested = target && macros ? { kcal: target.kcal, protein_g: macros.protein_g, carbs_g: macros.carbs_g, fat_g: macros.fat_g } : null
  const final = custom ? { kcal: n(custom.kcal), protein_g: n(custom.protein_g), carbs_g: n(custom.carbs_g), fat_g: n(custom.fat_g) } : suggested

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!bodyOk) return setError('Fill in your birth year, height and weight.')
    if (!final || Object.values(final).some((x) => !Number.isFinite(x) || x < 0) || final.kcal < 500) return setError('Check the targets: calories must be at least 500.')
    setBusy(true)
    try {
      await update({ sex, birth_year: n(birthYear), height_cm: n(height), activity })
      await saveWeighIn(today, n(kgText))
      await saveGoal({ effective_from: today, ...final, fiber_g: Math.round((final.kcal / 1000) * 14) })
      void qc.invalidateQueries({ queryKey: ['diary'] }); void qc.invalidateQueries({ queryKey: ['goals'] }); void qc.invalidateQueries({ queryKey: ['weigh-ins'] })
      toast(`Goal set: ${final.kcal.toLocaleString('en-IN')} kcal a day`)
      onClose()
    } catch (err) { setError(ruleMessage(err, 'Couldn’t save the goal.')) } finally { setBusy(false) }
  }

  const sel = (on: boolean) => `rounded-full px-3 py-1 text-sm ${on ? 'bg-accent-soft font-semibold text-accent' : 'bg-panel text-muted hover:bg-hover'}`
  const box = (label: string, value: string, set: (v: string) => void, unit: string, placeholder?: string) => (
    <label className="block"><span className="mb-1 block text-xs text-muted">{label}</span>
      <span className="relative block">
        <input inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} className="field pr-10 tabular-nums" />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">{unit}</span>
      </span>
    </label>
  )

  return (
    <Dialog open onClose={onClose} title="Your goals" wide closable>
      <form onSubmit={(e) => void submit(e)} className="space-y-5">
        <div>
          <h2 className="text-xl font-semibold">Your goals</h2>
          {current.data && <p className="mt-1 text-sm text-muted">Now: {current.data.kcal.toLocaleString('en-IN')} kcal since {current.data.effective_from}. A new goal starts today; past days keep their old one.</p>}
        </div>

        <section>
          <p className="label-caps mb-2">You</p>
          <div className="mb-3 flex gap-1.5" role="radiogroup" aria-label="Sex (for the energy formula)">
            {(['male', 'female'] as const).map((s) => <button key={s} type="button" role="radio" aria-checked={sex === s} onClick={() => setSex(s)} className={sel(sex === s)}>{s === 'male' ? 'Male' : 'Female'}</button>)}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {box('Birth year', birthYear, setBirthYear, '', '1998')}
            {box('Height', height, setHeight, 'cm', '175')}
            {box('Weight', kgText, setKg, 'kg', '70')}
          </div>
        </section>

        <section>
          <p className="label-caps mb-2">Activity</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(ACTIVITY) as Activity[]).map((a) => (
              <button key={a} type="button" onClick={() => setActivity(a)} aria-pressed={activity === a}
                className={`rounded-xl border px-3 py-2 text-left ${activity === a ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover'}`}>
                <span className="block text-sm font-medium">{ACTIVITY[a].label}</span>
                <span className="block text-xs text-muted">{ACTIVITY[a].hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <p className="label-caps mb-2">Goal</p>
          <div className="flex flex-wrap gap-1.5">
            {PACES.map((p) => <button key={p.value} type="button" onClick={() => { setPace(p.value); setCustom(null) }} className={sel(pace === p.value)}>{p.label}</button>)}
          </div>
        </section>

        <section className="rounded-2xl bg-panel p-4">
          {!suggested || !final ? (
            <p className="text-sm text-faint">Fill in your details to see your numbers.</p>
          ) : (
            <>
              <p className="text-sm text-muted tabular-nums">Maintenance ≈ <b className="text-ink">{Math.round(maintenance!).toLocaleString('en-IN')}</b> kcal/day</p>
              {target?.clamped && <p className="mt-1 text-xs text-important">Raised to {minKcal(sex).toLocaleString('en-IN')} kcal, the lowest we suggest without a professional’s advice. A slower pace gets you there safely.</p>}
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(['kcal', 'protein_g', 'carbs_g', 'fat_g'] as const).map((k) => (
                  <label key={k} className="block"><span className="mb-1 block text-xs text-muted">{{ kcal: 'Calories', protein_g: 'Protein', carbs_g: 'Carbs', fat_g: 'Fat' }[k]}</span>
                    <span className="relative block">
                      <input inputMode="numeric" value={custom ? custom[k] : String(suggested[k])} className="field pr-10 text-base font-semibold tabular-nums"
                        onChange={(e) => setCustom({ ...(custom ?? { kcal: String(suggested.kcal), protein_g: String(suggested.protein_g), carbs_g: String(suggested.carbs_g), fat_g: String(suggested.fat_g) }), [k]: e.target.value })} />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">{k === 'kcal' ? 'kcal' : 'g'}</span>
                    </span>
                  </label>
                ))}
              </div>
              {custom ? (
                <p className="mt-2 text-xs text-muted">Using your numbers. <button type="button" className="text-accent" onClick={() => setCustom(null)}>Back to the suggestion</button></p>
              ) : (
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                  <label className="block"><span className="text-xs text-muted">Protein: {proteinPerKg} g per kg</span>
                    <input type="range" min={1.2} max={2.2} step={0.1} value={proteinPerKg} onChange={(e) => setProteinPerKg(Number(e.target.value))} className="w-full accent-[var(--accent)]" /></label>
                  <label className="block"><span className="text-xs text-muted">Fat: {fatPct}% of calories</span>
                    <input type="range" min={20} max={35} step={1} value={fatPct} onChange={(e) => setFatPct(Number(e.target.value))} className="w-full accent-[var(--accent)]" /></label>
                </div>
              )}
            </>
          )}
        </section>

        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-hover">Cancel</button>
          <button disabled={busy || !final} className="bg-accent rounded-lg px-5 py-2 text-sm font-semibold text-on-accent">{busy ? 'Saving…' : 'Save goal'}</button>
        </div>
      </form>
    </Dialog>
  )
}
