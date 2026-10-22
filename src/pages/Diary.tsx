import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { copyEntries } from '@/api/diary'
import { Card } from '@/components/Card'
import { DayView } from '@/components/DayView'
import { DiaryCalendar } from '@/components/DiaryCalendar'
import { IconChevron } from '@/components/icons'
import { useSettings } from '@/contexts/SettingsContext'
import { useToast } from '@/contexts/ToastContext'
import { addDays, formatDayHeading, formatFullDate, todayKey } from '@/lib/dates'

/** Any day of the diary: pick it on the calendar (or step day by day), see and edit it, copy it to today. */
export function Diary() {
  const { timezone: tz } = useSettings()
  const { toast } = useToast()
  const qc = useQueryClient()
  const today = todayKey(tz)
  // /diary?day=2026-10-21 opens that day (links from Today's insights)
  const [params] = useSearchParams()
  const [day, setDay] = useState(() => { const d = params.get('day') ?? ''; return /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today ? d : today })

  const copyToToday = async () => {
    try {
      const n = await copyEntries(day, today)
      void qc.invalidateQueries({ queryKey: ['diary'] }); void qc.invalidateQueries({ queryKey: ['foods'] })
      toast(n ? `Copied ${n} item${n === 1 ? '' : 's'} to today` : 'Nothing to copy from that day.')
    } catch { toast('Couldn’t copy that day.', { kind: 'error' }) }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="page-top mx-auto max-w-5xl px-4 pb-32 lg:px-6 lg:pb-8">
        <header className="rise mb-5 flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-[28px] font-semibold leading-tight">Diary</h1>
          {day !== today && <button onClick={() => void copyToToday()} className="rounded-full border border-line px-4 py-1.5 text-sm hover:bg-hover">Copy this day to today</button>}
          <div className="flex items-center gap-1 rounded-full bg-panel p-1">
            <button aria-label="Previous day" onClick={() => setDay(addDays(day, -1))} className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-ink"><IconChevron size={16} className="rotate-180" /></button>
            <span className="min-w-36 text-center text-sm font-semibold" title={formatFullDate(day)}>{day === today ? 'Today' : formatDayHeading(day, tz)}</span>
            <button aria-label="Next day" onClick={() => setDay(addDays(day, 1))} className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-ink"><IconChevron size={16} /></button>
          </div>
        </header>
        <DayView day={day} side={<Card className="rise"><DiaryCalendar today={today} selected={day} onSelect={setDay} /></Card>} />
      </div>
    </div>
  )
}
