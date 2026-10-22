import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { LogDialog } from '@/components/LogDialog'
import { useSettings } from '@/contexts/SettingsContext'
import { hourIn, todayKey } from '@/lib/dates'
import { mealForHour } from '@/lib/meals'

interface LogApi { open: (opts?: { day?: string; meal?: string }) => void }

const LogContext = createContext<LogApi>({ open: () => {} })

/** One food logger for the whole app: the dock's ＋, a meal's ＋ and the L key all open it. */
export function LogProvider({ children }: { children: ReactNode }) {
  const { timezone } = useSettings()
  const [target, setTarget] = useState<{ day: string; meal: string } | null>(null)
  const open = useCallback((opts?: { day?: string; meal?: string }) => {
    // default: today, and the meal that fits the time of day
    setTarget({ day: opts?.day ?? todayKey(timezone), meal: opts?.meal ?? mealForHour(hourIn(timezone)) })
  }, [timezone])
  const api = useMemo(() => ({ open }), [open])
  return (
    <LogContext.Provider value={api}>
      {children}
      {target && <LogDialog day={target.day} meal={target.meal} onClose={() => setTarget(null)} />}
    </LogContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLog() { return useContext(LogContext) }
