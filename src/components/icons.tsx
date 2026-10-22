import type { SVGProps } from 'react'

// Tiny inline icon set (24px grid, 1.75 stroke): no icon-library weight in the bundle. Shared look with Mneme.
type P = SVGProps<SVGSVGElement> & { size?: number }
const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
})
const mk = (d: React.ReactNode) => ({ size, ...rest }: P) => <svg {...base(size)} {...rest}>{d}</svg>

export const IconPlus = mk(<path d="M12 5v14M5 12h14" />)
export const IconSearch = mk(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>)
export const IconToday = mk(<><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M4 10h16" /></>)
export const IconCalendar = IconToday
export const IconSettings = mk(<><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></>)
export const IconMore = mk(<><circle cx="5.5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="18.5" cy="12" r="1.2" fill="currentColor" /></>)
export const IconBack = mk(<path d="M15 5 8 12l7 7" />)
export const IconX = mk(<path d="M6 6l12 12M18 6 6 18" />)
export const IconCheck = mk(<path d="m5 12.5 4.5 4.5L19 7.5" />)
export const IconChevron = mk(<path d="m9 5 7 7-7 7" />)
export const IconClock = mk(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>)
export const IconInfo = mk(<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" /></>)
export const IconFlame = mk(<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.1 2-5.2 3.6-7 .4 1.7 1.3 2.8 2.4 3.4C11.8 7.6 13 5 15 3c.3 2.6 1.5 4.4 2.6 6 .9 1.4 1.4 2.9 1.4 4.8 0 4.1-2.8 7.2-7 7.2z" />)

// food & body
/** Diary: an open book. */
export const IconDiary = mk(<><path d="M12 6.5C10 5 7.5 4.5 4 4.5v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-14c-3.5 0-6 .5-8 2z" /><path d="M12 6.5v14" /></>)
/** Progress: a rising line over an axis. */
export const IconProgress = mk(<path d="M4 4v16h16M7.5 15l3.5-4 3 2.5L19.5 7" />)
/** Foods: an apple. */
export const IconFood = mk(<><path d="M12 7.5c-1.5-1-3.5-1.3-5-.5-2.5 1.4-2.8 5-1.5 8.2C6.7 18.3 9 21 12 19.6c3 1.4 5.3-1.3 6.5-4.4 1.3-3.2 1-6.8-1.5-8.2-1.5-.8-3.5-.5-5 .5z" /><path d="M12 7.5c0-2 .8-3.5 2.5-4.5" /></>)
/** Bathroom scale. */
export const IconScale = mk(<><rect x="4" y="4" width="16" height="16" rx="4" /><path d="M9 9.5a4 4 0 0 1 6 0M12 9.5l1-1.5" /></>)
/** A water drop. */
export const IconDrop = mk(<path d="M12 3.5s-6 6.4-6 10.6a6 6 0 0 0 12 0c0-4.2-6-10.6-6-10.6z" />)
