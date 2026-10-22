/**
 * The oversized "T." letterform used behind the login card: a heavy geometric T plus the accent-coloured full stop
 * (same idea as the "M." on Mneme and the "A." on Argus). Colours come from theme tokens, so it re-tints with every theme.
 */
export function BigT({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 800 640" className={className} style={style} role="img" aria-label="Trophe" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="tLetter" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="var(--letter)" />
          <stop offset="1" stopColor="var(--letter)" stopOpacity="0.86" />
        </linearGradient>
        <linearGradient id="tDot" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <polygon fill="url(#tLetter)" points="0,0 600,0 600,128 361,128 361,640 239,640 239,128 0,128" />
      <circle cx="728" cy="572" r="68" fill="url(#tDot)" />
    </svg>
  )
}
