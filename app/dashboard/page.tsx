import Link from 'next/link'
import GlassPanel from '@/components/GlassPanel'
import StatCard from '@/components/StatCard'
import GameTile from '@/components/GameTile'
import LogoutButton from '@/components/LogoutButton'
import { GAME_REGISTRY, type GameEntry } from '@/lib/games/registry'
// Server Component reading straight from the route handlers' own exported GET
// functions — not fetch('/api/stats') over HTTP. Both handlers already derive
// identity from the session cookie via getCurrentStudent(), so calling them
// in-process here gets the same auth + query logic as the client fetch used
// to have, without a second HTTP round trip and without duplicating the SQL
// (which lives in app/api/*/route.ts, out of scope for this change).
import { GET as getStats } from '@/app/api/stats/route'
import { GET as getMe } from '@/app/api/auth/me/route'

interface StatsOk {
  ok: true
  net: number
  gross: number
  potential: number
  answered: number
  correct: number
  wrong: number
  rounds_played: number
  continues: number
  sessions: number
  lastPlayedAt: string | null
  byGame: Array<{ gameId: string; answered: number; correct: number; net: number }>
}
interface ApiErr {
  ok: false
  error: string
}
type StatsResponse = StatsOk | ApiErr

interface MeOk {
  ok: true
  id: string
  name: string | null
}
type MeResponse = MeOk | ApiErr

// Only games with a real route go here; the not-yet-built games never
// navigate (GameTile renders them as a non-clickable div when enabled=false),
// so they don't need an entry. Match owns its own lever-setup screen
// (app/games/match/page.tsx) rather than going through /game-setup, since
// that page's constants (roundLength, quiz-only points) are quiz-specific.
const HREF_BY_ID: Record<string, string> = {
  'quiz-normal': '/game-setup?mode=normal',
  'quiz-rapid': '/game-setup?mode=rapid',
  match: '/games/match',
  'choose-word': '/games/word',
}

// The tile blurb is the student's only advance notice of what a game pays, so it has to
// stay truthful as points shapes are added. Exhaustive switch, not a ternary: the `never`
// default makes a new Points kind a compile error here instead of a tile that silently
// describes the wrong economy.
function pointsBlurb(entry: GameEntry): string {
  const p = entry.points
  switch (p.kind) {
    case 'flat':
      return `+${p.correct} / ${p.wrong} pts per answer`
    case 'guessCount':
      return `Up to +${p.byGuessCount[0]} pts, scored by guess count`
    case 'board':
      return `+${p.perPair} per pair, +${p.perfectBonus} for a clean board`
    default: {
      const exhaustive: never = p
      throw new Error(`pointsBlurb: unhandled points kind ${JSON.stringify(exhaustive)}`)
    }
  }
}

function formatLastPlayed(iso: string | null): string {
  if (!iso) return 'Never'
  // This renders on the server (UTC on Vercel), but the pilot cohort is Prof.
  // Singh's course at XLRI — IST throughout — so the display zone is pinned
  // explicitly rather than left to follow the server's clock: without this an
  // IST student playing at 01:00 on 5 Aug would see "4 Aug" here.
  // Locale and timezone both pinned. `undefined` locale means "whatever the runtime defaults to",
  // which differs between a dev machine and Vercel, and the pilot cohort is IST either way. Pinning
  // also keeps this safe to move into a client component later without a hydration mismatch.
  return new Date(iso).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata' })
}

/** The dashboard spine (package D1) — points, activity, and every game in
 *  GAME_REGISTRY as a tile, per the professor's first instruction: "you need
 *  to have a dashboard kind of a thing where quiz is one part of it." */
export default async function DashboardPage() {
  const [statsRes, meRes] = await Promise.all([getStats(), getMe()])
  const statsData = (await statsRes.json()) as StatsResponse
  const meData = (await meRes.json()) as MeResponse

  if (!statsData.ok) {
    // proxy.ts already redirects a fully signed-out visitor to /login before this
    // component ever renders, so the only way to land here is a cookie that expires
    // mid-request or a DB hiccup — handle it sensibly rather than crashing on
    // undefined stats.
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-16 flex items-center justify-center">
        <GlassPanel className="max-w-md p-8 text-center">
          <p className="text-slate-300 font-semibold mb-4">
            {statsData.error === 'not signed in'
              ? "You're signed out."
              : "Couldn't load your dashboard right now — try refreshing in a bit."}
          </p>
          <Link href="/login" className="text-emerald-300 font-black hover:text-emerald-200">
            Go to login →
          </Link>
        </GlassPanel>
      </main>
    )
  }

  const stats = statsData
  const name = meData.ok ? meData.name : null
  const accuracy = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0
  // Negative marking is real: gross is what was earned before penalties, net is what
  // was kept, and the gap between them is what negative marking actually cost.
  const gap = stats.gross - stats.net

  // byGame may contain a 'unknown' bucket for events logged before game_type existed
  // (see app/api/stats/route.ts). It never matches a GAME_REGISTRY id, so the loop
  // below simply never gives it a tile — its rows are still counted in the lifetime
  // totals above (net/gross/answered/etc. come from the whole-events aggregate, not
  // from byGame), so nothing is silently dropped, it's just not shown per-game.
  const byGameMap = new Map(stats.byGame.map((g) => [g.gameId, g]))

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <div className="flex justify-end mb-4">
            <LogoutButton />
          </div>
          <div className="text-center">
            <h1 className="text-4xl font-black text-white mb-2">
              Welcome back{name ? `, ${name}` : ''}!
            </h1>
            <p className="text-slate-400 text-lg">
              {stats.rounds_played === 0
                ? 'Pick a game and play your first round.'
                : "Ready to sharpen your mind? Let's keep it going! 🔥"}
            </p>
          </div>
        </div>

        {/* Points: gross vs net vs the gap between them — negative marking is real, so
            a student must see what they earned versus what they kept, not just net. */}
        <section className="mb-10">
          <h2 className="text-white font-black text-xl mb-4">Points</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Gross" value={stats.gross} accent="amber" hint="earned before penalties" />
            <StatCard label="Net" value={stats.net} accent="emerald" hint="after negative marking" />
            <StatCard label="Lost to penalties" value={gap} accent="violet" hint="gross minus net" />
            <StatCard label="Potential" value={stats.potential} accent="sky" hint="if every answer were correct" />
          </div>
        </section>

        {/* Activity */}
        <section className="mb-10">
          <h2 className="text-white font-black text-xl mb-4">Activity</h2>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <GlassPanel className="p-4 text-center">
              <p className="text-slate-400 text-xs uppercase font-semibold mb-1">Rounds</p>
              <p className="text-2xl font-black text-white">{stats.rounds_played}</p>
            </GlassPanel>
            <GlassPanel className="p-4 text-center">
              <p className="text-slate-400 text-xs uppercase font-semibold mb-1">Accuracy</p>
              <p className="text-2xl font-black text-white">{accuracy}%</p>
            </GlassPanel>
            <GlassPanel className="p-4 text-center">
              <p className="text-slate-400 text-xs uppercase font-semibold mb-1">Continues</p>
              <p className="text-2xl font-black text-white">{stats.continues}</p>
            </GlassPanel>
            <GlassPanel className="p-4 text-center">
              <p className="text-slate-400 text-xs uppercase font-semibold mb-1">Sessions</p>
              <p className="text-2xl font-black text-white">{stats.sessions}</p>
            </GlassPanel>
            <GlassPanel className="p-4 text-center">
              <p className="text-slate-400 text-xs uppercase font-semibold mb-1">Last played</p>
              <p className="text-2xl font-black text-white">{formatLastPlayed(stats.lastPlayedAt)}</p>
            </GlassPanel>
          </div>
        </section>

        {/* Games — the spine. Driven entirely by GAME_REGISTRY, never a hardcoded
            list, so the four not-yet-built games show up locked and a fifth game
            added to the registry later needs no change here. */}
        <section>
          <h2 className="text-white font-black text-xl mb-4">Games</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {GAME_REGISTRY.map((entry) => {
              const href = HREF_BY_ID[entry.id]
              // A tile is only actually playable if the registry says so AND a route
              // exists for it here. Checking entry.enabled alone would let someone
              // flip enabled: true (the documented way to ship A1-A4) before wiring
              // HREF_BY_ID, rendering a full-colour, clickable tile that goes to '#'
              // and does nothing. Locked-until-both-are-true is the safe default —
              // throwing instead would take down the whole dashboard (the spine) for
              // every student over one missing route entry.
              const playable = entry.enabled && Boolean(href)
              const played = byGameMap.get(entry.id)
              const blurb = playable
                ? played && played.answered > 0
                  ? `${played.answered} answered · ${Math.round((played.correct / played.answered) * 100)}% correct`
                  : 'Not played yet'
                : pointsBlurb(entry)
              return (
                <GameTile
                  key={entry.id}
                  id={entry.id}
                  displayName={entry.displayName}
                  primitive={entry.primitive}
                  enabled={playable}
                  href={href ?? '#'}
                  blurb={blurb}
                />
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}
