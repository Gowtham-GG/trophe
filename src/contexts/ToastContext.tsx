import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Confirmation, type ConfirmOptions } from '@/components/Confirmation'
import { canPopover, getEffectsMode, prefersReducedMotion } from '@/lib/effects'

interface Toast { id: number; message: string; kind: 'info' | 'error'; action?: { label: string; onClick: () => void } }
interface ToastApi {
  toast: (message: string, opts?: { kind?: 'info' | 'error'; action?: Toast['action']; ms?: number }) => void
  /** A success worth a moment: full-screen on this device unless it's set to notifications only (or asks for reduced motion). */
  confirm: (c: ConfirmOptions) => void
}

const ToastContext = createContext<ToastApi>({ toast: () => {}, confirm: () => {} })

/**
 * An open modal <dialog> makes everything outside it inert, even popovers drawn above it. So while one is open,
 * toasts and confirmations are mounted inside it (still top-layer popovers, so still placed on the whole screen).
 */
const openDialog = (): HTMLElement | null => {
  const all = document.querySelectorAll<HTMLDialogElement>('dialog[open]')
  return all[all.length - 1] ?? null
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const [moment, setMoment] = useState<(ConfirmOptions & { id: number; leaving: boolean }) | null>(null)
  const seq = useRef(0)
  const momentTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const layer = useRef<HTMLDivElement>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)
  const inHost = (node: ReactNode) => (host?.isConnected ? createPortal(node, host) : node)

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), [])
  const toast = useCallback<ToastApi['toast']>((message, opts) => {
    const id = ++seq.current
    setHost(openDialog())
    setItems((l) => [...l.slice(-2), { id, message, kind: opts?.kind ?? 'info', action: opts?.action }])
    setTimeout(() => dismiss(id), opts?.ms ?? 5000)
  }, [dismiss])

  const closeMoment = useCallback(() => {
    clearTimeout(momentTimer.current)
    setMoment((m) => (m ? { ...m, leaving: true } : m))
    setTimeout(() => setMoment((m) => (m?.leaving ? null : m)), 260)
  }, [])

  const confirm = useCallback<ToastApi['confirm']>((c) => {
    if (getEffectsMode() === 'subtle' || prefersReducedMotion()) {
      return toast(`${c.title}${c.detail ? ` · ${c.detail}` : ''}`, { action: c.action })
    }
    clearTimeout(momentTimer.current)
    setHost(openDialog())
    setMoment({ ...c, id: ++seq.current, leaving: false })
    // long enough to read, a little longer when there's an Undo to reach
    momentTimer.current = setTimeout(closeMoment, c.action ? 2600 : 1800)
  }, [toast, closeMoment])

  // Toasts live in the top layer too, re-raised on each change, so an Undo stays clickable above an open dialog.
  useEffect(() => {
    const el = layer.current
    if (!canPopover || !el) return
    if (el.matches(':popover-open')) el.hidePopover()
    if (items.length) el.showPopover()
  }, [items, host])

  const api = useMemo(() => ({ toast, confirm }), [toast, confirm])
  return (
    <ToastContext.Provider value={api}>
      {children}
      {moment && inHost(<Confirmation key={moment.id} c={moment} leaving={moment.leaving} onDismiss={closeMoment} />)}
      {inHost(<div ref={layer} popover={canPopover ? 'manual' : undefined} aria-live="polite" role="status"
        className="layer pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center justify-end gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+5.75rem)]">
        {items.map((t) => (
          <div key={t.id} className={`pop pointer-events-auto flex max-w-md items-center gap-3 glass-strong rounded-2xl px-4 py-3 text-sm font-medium ${t.kind === 'error' ? 'text-danger' : 'text-ink'}`}>
            <span>{t.message}</span>
            {t.action && (
              <button className="font-semibold text-accent hover:underline" onClick={() => { t.action!.onClick(); dismiss(t.id) }}>{t.action.label}</button>
            )}
          </div>
        ))}
      </div>)}
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() { return useContext(ToastContext) }
