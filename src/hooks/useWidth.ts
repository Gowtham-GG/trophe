import { useEffect, useRef, useState } from 'react'

/** Measure an element's width (charts redraw to fit, no fixed sizes). */
export function useWidth<T extends HTMLElement>(fallback = 600) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}
