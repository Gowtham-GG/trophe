import { Link } from 'react-router-dom'

/** The wordmark: "Trophe" followed by an accent-coloured full stop (same idea as "Argus." and "Mneme."). */
export function Brand({ to = '/', className = '' }: { to?: string; className?: string }) {
  return (
    <Link to={to} aria-label="Trophe — home" className={`text-[21px] font-bold tracking-tight text-ink no-underline hover:no-underline ${className}`}>
      Trophe<span className="text-accent">.</span>
    </Link>
  )
}
