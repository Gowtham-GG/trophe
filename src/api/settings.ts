import { supabase } from '@/lib/supabase'
import type { Settings, ThemePref } from '@/types/db'
import { toError } from './errors'

const SETTINGS_COLUMNS = 'user_id,timezone,theme'

export async function fetchSettings(): Promise<Settings | null> {
  const { data, error } = await supabase.from('settings').select(SETTINGS_COLUMNS).maybeSingle()
  if (error) throw toError(error)
  return data as Settings | null
}

export interface SettingsPatch {
  timezone?: string
  theme?: ThemePref
}

/** Upsert: the first save creates the row (no trigger on auth.users, see README "Coexistence"). */
export async function saveSettings(patch: SettingsPatch): Promise<Settings> {
  const { data, error } = await supabase
    .from('settings').upsert(patch, { onConflict: 'user_id' }).select(SETTINGS_COLUMNS).single()
  if (error) throw toError(error)
  return data as Settings
}
