export type StatAccent = 'emerald' | 'amber' | 'violet' | 'sky'

export interface StatCardProps {
  label: string
  value: number | string
  accent?: StatAccent
  hint?: string
}

// Tailwind can't see dynamically-built class strings like `from-${accent}-500` —
// they'd get purged from the production build. Every accent's full class list is
// spelled out literally here instead.
const ACCENTS: Record<StatAccent, { panel: string; value: string; label: string; hint: string }> = {
  emerald: {
    panel: 'bg-gradient-to-br from-emerald-500/20 via-emerald-600/10 to-emerald-700/5 border-emerald-500/40 hover:shadow-emerald-500/20',
    value: 'text-emerald-300',
    label: 'text-emerald-300/80',
    hint: 'text-emerald-400/60',
  },
  amber: {
    panel: 'bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-amber-700/5 border-amber-500/40 hover:shadow-amber-500/20',
    value: 'text-amber-300',
    label: 'text-amber-300/80',
    hint: 'text-amber-400/60',
  },
  violet: {
    panel: 'bg-gradient-to-br from-violet-500/20 via-violet-600/10 to-violet-700/5 border-violet-500/40 hover:shadow-violet-500/20',
    value: 'text-violet-300',
    label: 'text-violet-300/80',
    hint: 'text-violet-400/60',
  },
  sky: {
    panel: 'bg-gradient-to-br from-sky-500/20 via-sky-600/10 to-sky-700/5 border-sky-500/40 hover:shadow-sky-500/20',
    value: 'text-sky-300',
    label: 'text-sky-300/80',
    hint: 'text-sky-400/60',
  },
}

/** A single lifetime/round metric — the building block behind the dashboard's
 *  "Net Points" / "Potential" style tiles on app/page.tsx, generalised with a
 *  4-way accent so multiple stats can sit side by side without colliding. */
export default function StatCard({ label, value, accent = 'sky', hint }: StatCardProps) {
  const c = ACCENTS[accent]
  return (
    <div className={`relative rounded-2xl border p-6 shadow-xl hover:shadow-lg transition-all duration-300 ${c.panel}`}>
      <p className={`text-sm font-semibold uppercase tracking-wider mb-2 ${c.label}`}>{label}</p>
      <p className={`text-5xl font-black mb-1 ${c.value}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {hint && <p className={`text-xs ${c.hint}`}>{hint}</p>}
    </div>
  )
}
