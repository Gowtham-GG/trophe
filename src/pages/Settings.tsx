import { signOut } from '@/api/auth'
import { Card } from '@/components/Card'
import { ThemePicker } from '@/components/ThemePicker'
import { useSettings } from '@/contexts/SettingsContext'
import { useToast } from '@/contexts/ToastContext'
import { useAuth } from '@/hooks/useAuth'
import { browserTimezone, isValidTimezone } from '@/lib/dates'

const zones = (): string[] => {
  try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone') } catch { return ['UTC'] }
}

export function Settings() {
  const { user } = useAuth()
  const { timezone, update } = useSettings()
  const { toast } = useToast()

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-top mx-auto max-w-3xl space-y-4 px-4 pb-32 lg:px-6 lg:pb-8">
        <h1 className="mb-5 text-[28px] font-semibold leading-tight">Settings</h1>

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
