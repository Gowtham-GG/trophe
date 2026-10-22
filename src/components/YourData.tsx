import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { bodyCsv, diaryCsv, download, exportBackup, restoreBackup, type Backup } from '@/api/backup'
import { ruleMessage } from '@/api/errors'
import { useToast } from '@/contexts/ToastContext'
import { useSettings } from '@/contexts/SettingsContext'
import { todayKey } from '@/lib/dates'
import { Card } from './Card'
import { ConfirmDialog } from './Dialog'

/** Settings → Your data: a full backup (JSON), the diary and body as CSV, and restoring a backup. */
export function YourData() {
  const { timezone } = useSettings()
  const { toast } = useToast()
  const qc = useQueryClient()
  const file = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, setPending] = useState<{ doc: Backup; name: string } | null>(null)
  const stamp = todayKey(timezone)

  const run = async (what: string, fn: (b: Backup) => void) => {
    setBusy(what)
    try { fn(await exportBackup()) } catch (err) { toast(ruleMessage(err, 'Couldn’t export.'), { kind: 'error' }) } finally { setBusy(null) }
  }
  const pick = async (f: File | undefined) => {
    if (!f) return
    try {
      const doc = JSON.parse(await f.text()) as Backup
      if (doc?.app !== 'trophe' || typeof doc.tables !== 'object') throw new Error('not a backup')
      setPending({ doc, name: f.name })
    } catch { toast('That file isn’t a Trophe backup.', { kind: 'error' }) } finally { if (file.current) file.current.value = '' }
  }
  const restore = async () => {
    if (!pending) return
    setBusy('restore')
    try {
      const added = await restoreBackup(pending.doc)
      const n = Object.values(added).reduce((s, x) => s + x, 0)
      void qc.invalidateQueries()
      toast(n ? `Restored ${n} item${n === 1 ? '' : 's'} that were missing.` : 'Nothing was missing: everything in that backup is already here.')
    } catch (err) { toast(ruleMessage(err, 'Couldn’t restore that backup.'), { kind: 'error' }) } finally { setBusy(null); setPending(null) }
  }

  const btn = 'rounded-lg border border-line px-4 py-2 text-sm hover:bg-hover disabled:opacity-60'
  return (
    <Card title="Your data">
      <p className="mb-3 text-sm text-muted">Everything you’ve put into Trophe is yours to take: a full backup, or your diary and body measurements for a spreadsheet.</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={!!busy} onClick={() => void run('json', (b) => download(`trophe-backup-${stamp}.json`, JSON.stringify(b, null, 1), 'application/json'))} className="bg-accent rounded-lg px-4 py-2 text-sm font-semibold text-on-accent">
          {busy === 'json' ? 'Preparing…' : 'Download backup'}
        </button>
        <button disabled={!!busy} onClick={() => void run('diary', (b) => download(`trophe-diary-${stamp}.csv`, diaryCsv(b), 'text/csv'))} className={btn}>{busy === 'diary' ? 'Preparing…' : 'Diary (CSV)'}</button>
        <button disabled={!!busy} onClick={() => void run('body', (b) => download(`trophe-weight-${stamp}.csv`, bodyCsv(b), 'text/csv'))} className={btn}>{busy === 'body' ? 'Preparing…' : 'Weight & measurements (CSV)'}</button>
        <button disabled={!!busy} onClick={() => file.current?.click()} className={btn}>{busy === 'restore' ? 'Restoring…' : 'Restore a backup…'}</button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
      <p className="mt-2 text-xs text-faint">Restoring adds back only what’s missing — it never changes or deletes anything that’s here — so it’s safe to run more than once.</p>
      <ConfirmDialog open={!!pending} onClose={() => setPending(null)} confirmLabel="Restore" title={`Restore ${pending?.name ?? ''}?`}
        body={`A backup from ${pending ? new Date(pending.doc.exported_at).toLocaleString('en-IN') : ''}. Anything in it that this account doesn’t have will be added; nothing here is changed.`}
        onConfirm={() => void restore()} />
    </Card>
  )
}
