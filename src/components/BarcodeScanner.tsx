import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ruleMessage } from '@/api/errors'
import { findFoodByBarcode, restoreFood } from '@/api/foods'
import { lookupBarcode, saveExternalFood } from '@/api/online'
import { normaliseBarcode, type ExternalFood } from '@/lib/external'
import { barcodeDetector } from '@/lib/scanner'
import type { Food } from '@/types/db'

type CameraState = 'starting' | 'scanning' | 'denied' | 'none' | 'unsupported'

const CAMERA_MESSAGE: Record<Exclude<CameraState, 'scanning'>, string> = {
  starting: 'Starting the camera…',
  denied: 'Camera access is off for Trophe. Allow it in the browser’s site settings, or type the number below.',
  none: 'No camera found. Type the number under the barcode instead.',
  unsupported: 'This browser can’t read barcodes. Type the number under the barcode instead.',
}

/** The camera, reading until it sees a valid product barcode (EAN / UPC). Stops the camera when it unmounts. */
function Camera({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<CameraState>('starting')
  const report = useRef(onCode)
  useEffect(() => { report.current = onCode }, [onCode])

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer = 0
    let stopped = false
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setState('none')
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      } catch (e) { return setState((e as DOMException).name === 'NotAllowedError' ? 'denied' : 'none') }
      if (stopped || !video.current) return stream.getTracks().forEach((t) => t.stop())
      const v = video.current
      v.srcObject = stream
      await v.play().catch(() => {})
      const detector = await barcodeDetector().catch(() => null)
      if (stopped) return
      if (!detector) return setState('unsupported')
      setState('scanning')
      const tick = async () => {
        if (stopped) return
        const codes = v.readyState >= 2 ? await detector.detect(v).catch(() => []) : []
        const code = codes.map(normaliseBarcode).find((c): c is string => !!c)
        if (code && !stopped) { stopped = true; stream?.getTracks().forEach((t) => t.stop()); return report.current(code) }
        timer = window.setTimeout(() => void tick(), 150)
      }
      void tick()
    }
    void start()
    return () => { stopped = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()) }
  }, [])

  return (
    <div>
      <div className={`relative mx-auto max-h-[40vh] max-w-full overflow-hidden rounded-2xl bg-black ${state === 'scanning' || state === 'starting' ? 'aspect-[4/3]' : 'hidden'}`}>
        <video ref={video} muted playsInline className="size-full object-cover" />
        {state === 'scanning' && <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />}
      </div>
      <p role="status" className={`mt-2 text-sm ${state === 'scanning' ? 'text-muted' : 'text-faint'}`}>
        {state === 'scanning' ? 'Point the camera at the barcode on the packet.' : CAMERA_MESSAGE[state]}
      </p>
    </div>
  )
}

/**
 * Scan (or type) a barcode: your own food with that code if you have one, else Open Food Facts (copied into your
 * foods), else an offer to create it with the barcode attached so the next scan finds it.
 */
export function ScanStep({ onFound, onCreate }: {
  onFound: (food: Pick<Food, 'id' | 'name' | 'brand' | 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g'> & { fiber_g?: number | null }) => void
  onCreate: (barcode: string) => void
}) {
  const [attempt, setAttempt] = useState(0)
  const [looking, setLooking] = useState<string | null>(null)
  const [missing, setMissing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [typed, setTyped] = useState('')

  const lookup = async (code: string) => {
    setLooking(code); setMissing(null); setError(null)
    try {
      const own = await findFoodByBarcode(code)
      if (own) {
        if (own.archived_at) await restoreFood(own.id)
        return onFound(own)
      }
      const found: ExternalFood | null = await lookupBarcode(code)
      if (found) return onFound({ ...found, id: await saveExternalFood(found) })
      setMissing(code)
    } catch (err) {
      setError(ruleMessage(err, 'Couldn’t look that up. Try again.'))
      setAttempt((a) => a + 1)
    } finally { setLooking(null) }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const code = normaliseBarcode(typed)
    if (!code) return setError('That isn’t a valid barcode. It’s the 8 or 13 digits under the lines.')
    void lookup(code)
  }

  return (
    <div className="space-y-4">
      {missing ? (
        <div className="rounded-2xl bg-panel px-4 py-4 text-sm">
          <p className="font-medium">No product with barcode {missing} yet.</p>
          <p className="mt-1 text-muted">Create it from the label once; the barcode is saved with it, so the next scan finds it.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => onCreate(missing)} className="bg-accent rounded-lg px-4 py-2 text-sm font-semibold text-on-accent">Create food</button>
            <button onClick={() => { setMissing(null); setAttempt((a) => a + 1) }} className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-hover">Scan again</button>
          </div>
        </div>
      ) : looking ? (
        <div className="rounded-2xl bg-panel px-4 py-6 text-center text-sm text-muted" role="status">Looking up {looking}…</div>
      ) : (
        <Camera key={attempt} onCode={(c) => void lookup(c)} />
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <form onSubmit={submit} className="flex gap-2">
        <input inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type the barcode number" aria-label="Barcode number"
          className="field min-w-0 flex-1 tabular-nums" maxLength={20} />
        <button disabled={!typed.trim() || !!looking} className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-hover">Look up</button>
      </form>
      <p className="text-[11px] text-faint">Products: Open Food Facts (ODbL). Check the packet — crowd-sourced numbers can be off.</p>
    </div>
  )
}
