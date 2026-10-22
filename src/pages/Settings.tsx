import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { signOut } from '@/api/auth'
import { goalFor } from '@/api/goals'
import { GoalWizard } from '@/components/GoalWizard'
import { Card } from '@/components/Card'
import { ThemePicker } from '@/components/ThemePicker'
import { useSettings } from '@/contexts/SettingsContext'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/hooks/useAuth'
import { browserTimezone, isValidTimezone, todayKey } from '@/lib/dates'
import { ACTIVITY } from '@/lib/nutrition'

const zones = (): string[] => {
  try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone') } catch { return ['UTC'] }
}

export function Settings() {
  const { user } = useAuth()
  const { timezone, profile, update } = useSettings()
  const { toast } = useToast()
  const goal = useQuery({ queryKey: ['goals', todayKey(timezone)], queryFn: () => goalFor(todayKey(timezone)) })
  // /settings#goals (from "Set your calorie goal" on Today) opens the wizard straight away
  const [wizard, setWizard] = useState(() => typeof location !== 'undefined' && location.hash === '#goals')
  useEffect(() => { if (location.hash === '#goals') document.getElementById('goals')?.scrollIntoView() }, [])

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-top mx-auto max-w-3xl space-y-4 px-4 pb-32 lg:px-6 lg:pb-8">
        <h1 className="mb-5 text-[28px] font-semibold leading-tight">Settings</h1>

        <div id="goals">
          <Card title="Goals">
            {goal.data ? (
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {([['Calories', goal.data.kcal, 'kcal'], ['Protein', goal.data.protein_g, 'g'], ['Carbs', goal.data.carbs_g, 'g'], ['Fat', goal.data.fat_g, 'g']] as const).map(([label, v, unit]) => (
                  <div key={label} className="rounded-xl bg-panel px-3 py-2">
                    <p className="text-xs text-muted">{label}</p>
                    <p className="text-lg font-semibold tabular-nums">{v.toLocaleString('en-IN')} <span className="text-xs font-normal text-faint">{unit}</span></p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-4 text-sm text-muted">No goal yet. Set one to see what’s left each day and whether you’re on target.</p>
            )}
            {goal.data && <p className="mb-3 text-xs text-faint">Since {goal.data.effective_from}{profile.activity && ` · ${ACTIVITY[profile.activity].label.toLowerCase()}`}. Changing it starts a new goal today; past days keep theirs.</p>}
            <button onClick={() => setWizard(true)} className="bg-accent rounded-lg px-4 py-2 text-sm font-semibold text-on-accent">{goal.data ? 'Change goals' : 'Set up goals'}</button>
          </Card>
        </div>
        {wizard && <GoalWizard onClose={() => setWizard(false)} />}

        <Card title="Appearance">
          <p className="mb-4 text-sm text-muted">Pick a colour theme. It follows you across devices.</p>
          <ThemePicker />
        </Card>

        <Card title="Timezone">
          <p className="mb-2 text-sm text-muted">Decides when your day starts, so a late dinner lands on the right day.</p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={timezone} onChange={(e) => void update({ timezone: e.target.value }).catch(() => toast('Couldn’t save the timezone.', { kind: 'error' }))} aria-label="Timezone" className="max-w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm">
              {!zones().includes(timezone) && <option value={timezone}>{timezone}</option>}
              {zones().map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            {browserTimezone() !== timezone && isValidTimezone(browserTimezone()) && <button className="text-sm" onClick={() => void update({ timezone: browserTimezone() })}>Use {browserTimezone()}</button>}
          </div>
        </Card>

        <Card title="Account">
          <p className="mb-3 text-sm text-muted">Signed in as <b className="text-ink">{user?.email}</b>. This is the same sign-in you use for Argus and Mneme; your diary is private to you.</p>
          <button className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-hover" onClick={() => void signOut()}>Sign out</button>
        </Card>
      </div>
    </div>
  )
}
