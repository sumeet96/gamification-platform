import type { ReactNode } from 'react'

export interface GlassPanelProps {
  children: ReactNode
  className?: string
}

/** Frosted base surface — translucent slate, blur, hairline border. Everything
 *  else (StatCard, GameTile, dashboard sections) sits on top of this. */
export default function GlassPanel({ children, className = '' }: GlassPanelProps) {
  return (
    <div
      className={`rounded-2xl bg-slate-800/50 border border-slate-700/50 backdrop-blur-sm shadow-lg ${className}`}
    >
      {children}
    </div>
  )
}
