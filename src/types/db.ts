// Row shapes of the `trophe` schema, as PostgREST returns them.
export type { ThemePref } from '@/lib/themes'
import type { ThemePref } from '@/lib/themes'

export interface Settings {
  user_id: string
  timezone: string
  theme: ThemePref
}
