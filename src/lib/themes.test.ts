import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, normalizePref, resolveTheme, THEMES } from './themes'

describe('themes', () => {
  it('Trophe defaults to jade', () => {
    expect(DEFAULT_THEME).toBe('jade')
    expect(normalizePref(null)).toBe('jade')
    expect(normalizePref('nonsense')).toBe('jade')
  })
  it('keeps valid ids and maps the old light/dark values', () => {
    expect(normalizePref('ember')).toBe('ember')
    expect(normalizePref('system')).toBe('system')
    expect(normalizePref('light')).toBe('slate')
    expect(normalizePref('dark')).toBe('jade')
  })
  it('"match my device" resolves to jade or slate', () => {
    expect(resolveTheme('system', true)).toBe('jade')
    expect(resolveTheme('system', false)).toBe('slate')
    expect(resolveTheme('sand', true)).toBe('sand')
  })
  it('every theme id fits the database check', () => {
    for (const t of THEMES) expect(t.id).toMatch(/^[a-z][a-z0-9-]{1,23}$/)
  })
})
