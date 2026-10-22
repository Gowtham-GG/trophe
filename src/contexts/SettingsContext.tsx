import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchSettings, saveSettings, type SettingsPatch } from '@/api/settings'
import { useAuth } from '@/hooks/useAuth'
import { browserTimezone, isValidTimezone } from '@/lib/dates'
import { DEFAULT_THEME, normalizePref, resolveTheme, type ThemeId, type ThemePref } from '@/lib/themes'
import type { Activity, Settings, Sex } from '@/types/db'

interface SettingsValue {
  timezone: string
  /** what the user chose ('system' = match my device) */
  theme: ThemePref
  /** the concrete theme currently applied */
  activeTheme: ThemeId
  /** body profile for the goal wizard (all optional) */
  profile: { sex: Sex | null; birth_year: number | null; height_cm: number | null; activity: Activity | null }
  /** daily water goal in ml */
  waterGoal: number
  ready: boolean
  update: (patch: SettingsPatch) => Promise<void>
}

const SettingsContext = createContext<SettingsValue>({
  timezone: 'UTC', theme: DEFAULT_THEME, activeTheme: DEFAULT_THEME,
  profile: { sex: null, birth_year: null, height_cm: null, activity: null }, waterGoal: 2500, ready: false, update: async () => {},
})
const THEME_KEY = 'trophe-theme'

const prefersDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
const storedPref = (): ThemePref => { try { return normalizePref(localStorage.getItem(THEME_KEY)) } catch { return DEFAULT_THEME } }

function applyTheme(pref: ThemePref) {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref, prefersDark()))
  try { localStorage.setItem(THEME_KEY, pref) } catch { /* ignore */ }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['settings', user?.id], queryFn: fetchSettings, enabled: !!user, staleTime: 5 * 60_000 })
  // Until the account's setting has loaded, use what this device remembers (also what theme-init.js applied).
  const [local, setLocal] = useState<ThemePref>(storedPref)

  const timezone = q.data?.timezone && isValidTimezone(q.data.timezone) ? q.data.timezone : browserTimezone()
  const theme: ThemePref = q.data ? normalizePref(q.data.theme) : local
  const d = q.data
  const profile = useMemo(() => ({ sex: d?.sex ?? null, birth_year: d?.birth_year ?? null, height_cm: d?.height_cm ?? null, activity: d?.activity ?? null }),
    [d?.sex, d?.birth_year, d?.height_cm, d?.activity])

  const [dark, setDark] = useState(prefersDark)
  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setDark(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])

  useEffect(() => { applyTheme(theme) }, [theme, dark])

  const update = useCallback(async (patch: SettingsPatch) => {
    if (patch.theme) { setLocal(patch.theme); applyTheme(patch.theme) } // instant, even before the save returns
    // every change shows at once; put it back if the save fails
    const key = ['settings', user?.id]
    const before = qc.getQueryData<Settings | null>(key)
    if (before) qc.setQueryData<Settings | null>(key, { ...before, ...patch })
    try {
      qc.setQueryData<Settings | null>(key, await saveSettings(patch))
    } catch (e) {
      qc.setQueryData<Settings | null>(key, before)
      throw e
    }
  }, [qc, user?.id])

  // First login: remember the browser's timezone so "today" in the diary is the user's day.
  useEffect(() => {
    if (!user || !q.isSuccess) return
    if (!q.data || q.data.timezone === 'UTC') {
      const tz = browserTimezone()
      if (tz !== 'UTC' && isValidTimezone(tz)) void update({ timezone: tz }).catch(() => {})
    }
  }, [user, q.isSuccess, q.data, update])

  const value = useMemo(
    () => ({ timezone, theme, activeTheme: resolveTheme(theme, dark), profile, waterGoal: q.data?.water_goal_ml ?? 2500, ready: !user || q.isSuccess, update }),
    [timezone, theme, dark, profile, q.data?.water_goal_ml, user, q.isSuccess, update],
  )
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings() { return useContext(SettingsContext) }
