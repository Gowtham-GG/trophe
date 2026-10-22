import type { ReactNode } from 'react'
import { Card } from './Card'

/** A page whose features land in a later phase: heading, what it will hold, and when. */
export function ComingSoon({ title, phase, children }: { title: string; phase: string; children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="page-top mx-auto max-w-3xl px-4 pb-32 lg:px-6 lg:pb-8">
        <h1 className="rise mb-5 text-[28px] font-semibold leading-tight">{title}</h1>
        <Card title={`Coming in ${phase}`} className="rise">
          <div className="space-y-2 text-sm text-muted">{children}</div>
        </Card>
      </div>
    </div>
  )
}
