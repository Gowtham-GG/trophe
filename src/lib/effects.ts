// How confirmations look on this device: a full-screen moment after logging (as in Argus), or notifications only.
// Kept in localStorage: it's a display preference, and a phone and a laptop can reasonably differ.
export type EffectsMode = 'full' | 'subtle'

const KEY = 'trophe-effects'

export function getEffectsMode(): EffectsMode {
  try { return localStorage.getItem(KEY) === 'subtle' ? 'subtle' : 'full' } catch { return 'full' }
}

export function setEffectsMode(mode: EffectsMode): void {
  try { localStorage.setItem(KEY, mode) } catch { /* private mode: the choice just won't persist */ }
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Top-layer popovers stack above an open <dialog> (the log dialog); without the API, a fixed layer is the fallback. */
export const canPopover = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype
