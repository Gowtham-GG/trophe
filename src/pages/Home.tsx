import { DayView } from '@/components/DayView'
import { FastingBanner } from '@/components/FastingBanner'
import { InsightList } from '@/components/InsightCards'
import { useSettings } from '@/contexts/SettingsContext'
import { formatFullDate, todayKey } from '@/lib/dates'

/** Today: the day's ring, macros and meals. */
export function Home() {
  const { timezone: tz } = useSettings()
  const day = todayKey(tz)
  return (
    <div className="h-full overflow-y-auto">
      <div className="page-top mx-auto max-w-5xl px-4 pb-32 lg:px-6 lg:pb-8">
        <header className="rise mb-5">
          <p className="label-caps">{formatFullDate(day)}</p>
          <h1 className="mt-1 text-[34px] font-bold leading-tight">Today</h1>
        </header>
        <div className="mb-4 space-y-2 empty:hidden"><FastingBanner /><InsightList today={day} limit={2} dismissible /></div>
        <DayView day={day} />
      </div>
    </div>
  )
}
