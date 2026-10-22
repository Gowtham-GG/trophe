/** A progress ring (0–1, capped visually at 1). Over target turns the arc amber; colours come from theme tokens. */
export function Ring({ value, size = 168, stroke = 14, children, label }: { value: number; size?: number; stroke?: number; children?: React.ReactNode; label: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Number.isFinite(value) ? Math.max(0, value) : 0
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--panel)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={v > 1 ? 'var(--important)' : 'var(--accent)'} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(v, 1))} style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.2,0.8,0.2,1)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

/** A thin horizontal bar for one macro: name, grams eaten / target. */
export function MacroBar({ name, eaten, target, tone }: { name: string; eaten: number | null; target: number | null; tone: string }) {
  const pct = eaten != null && target ? Math.min(eaten / target, 1) * 100 : 0
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="font-medium">{name}</span>
        <span className="tabular-nums text-muted">{eaten ?? '—'} / {target ?? '—'} g</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-panel">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone, transition: 'width 600ms cubic-bezier(0.2,0.8,0.2,1)' }} />
      </div>
    </div>
  )
}
