import Link from 'next/link'
import { Lock, Play } from 'lucide-react'

export type GamePrimitive = 'mcq' | 'term_definition'

export interface GameTileProps {
  id: string
  displayName: string
  primitive: GamePrimitive
  enabled: boolean
  href: string
  blurb?: string
}

const PRIMITIVE_LABEL: Record<GamePrimitive, string> = {
  mcq: 'Multiple choice',
  term_definition: 'Term & definition',
}

/** One game tile for the dashboard grid. Locked (enabled=false) tiles render
 *  dimmed with a "Coming soon" badge and are deliberately a <div>, not a <Link> —
 *  they must never be clickable. Unlocked tiles link straight to `href`. */
export default function GameTile({ id, displayName, primitive, enabled, href, blurb }: GameTileProps) {
  const primitiveLabel = PRIMITIVE_LABEL[primitive]

  if (!enabled) {
    return (
      <div
        data-game-id={id}
        aria-disabled="true"
        className="relative rounded-2xl border border-slate-700/50 bg-slate-800/30 p-6 opacity-50 cursor-not-allowed select-none"
      >
        <span className="absolute top-4 right-4 rounded-full bg-slate-700/60 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-slate-300 flex items-center gap-1">
          <Lock className="w-3 h-3" /> Coming soon
        </span>
        <p className="text-slate-500 text-xs uppercase font-semibold mb-2">{primitiveLabel}</p>
        <h3 className="font-black text-slate-400 text-lg mb-1">{displayName}</h3>
        {blurb && <p className="text-slate-600 text-sm">{blurb}</p>}
      </div>
    )
  }

  return (
    <Link
      href={href}
      data-game-id={id}
      className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-1 shadow-lg hover:shadow-2xl hover:shadow-violet-500/20 transition-all duration-300 block motion-reduce:transition-none"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-violet-500 to-fuchsia-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 motion-reduce:transition-none" />
      <div className="relative rounded-xl bg-slate-900/90 p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-violet-300/80 text-xs uppercase font-semibold mb-2">{primitiveLabel}</p>
            <h3 className="font-black text-white text-lg mb-1">{displayName}</h3>
            {blurb && <p className="text-slate-400 text-sm">{blurb}</p>}
          </div>
          <Play className="w-5 h-5 text-white flex-shrink-0 group-hover:translate-x-1 transition-transform motion-reduce:transition-none motion-reduce:transform-none" />
        </div>
      </div>
    </Link>
  )
}
