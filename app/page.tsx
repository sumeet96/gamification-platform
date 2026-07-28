'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Play, Zap, Clock, LogOut } from 'lucide-react'
import { useGame } from '@/lib/game/game-context'

/** Animate a number from its current display value toward `target`. */
function useCountUp(target: number) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(0)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const cur = ref.current
      const next = cur + (target - cur) * 0.15
      if (Math.abs(target - next) < 0.5) {
        ref.current = target
        setDisplay(target)
        return
      }
      ref.current = next
      setDisplay(Math.round(next))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return display
}

/** Lifetime totals from GET /api/stats — see app/api/stats/route.ts. */
interface LifetimeStats {
  net: number
  potential: number
  answered: number
  correct: number
  wrong: number
  rounds_played: number
  continues: number
  sessions: number
}

const ZERO_STATS: LifetimeStats = {
  net: 0, potential: 0, answered: 0, correct: 0, wrong: 0, rounds_played: 0, continues: 0, sessions: 0,
}

/** Pulsing placeholder for a stat that hasn't loaded yet — never a bare 0 that would
 *  later jump to the real value. */
function StatSkeleton({ className = 'h-8 w-12' }: { className?: string }) {
  return <span className={`inline-block rounded bg-slate-700/50 animate-pulse ${className}`} />
}

export default function Home() {
  const router = useRouter()
  // Only resetSession is needed here now. The dashboard's numbers come from
  // /api/stats (lifetime, server-side); per-tab session state deliberately no
  // longer feeds this screen.
  const { resetSession } = useGame()
  const [studentName, setStudentName] = useState<string | null>(null)
  // Lifetime stats read from the DB (app/api/stats) — what the dashboard displays.
  // `session` above still exists and still drives gameplay/round-numbering/event
  // logging untouched; it is no longer what the dashboard shows.
  const [stats, setStats] = useState<LifetimeStats>(ZERO_STATS)
  const [statsStatus, setStatsStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  // "Signed in" is tracked separately from "we know the name". A DB blip or cold
  // start on the name lookup must not hide the only logout control — on a shared
  // classroom laptop that leaves the current student unable to sign out, and the
  // next student's play gets attributed to them. Only a confirmed 401 ("no
  // session") flips this to false; reaching this page is not itself proof of a
  // session, but a failed/erroring lookup is not proof of its absence either, so
  // we stay optimistic until the server explicitly says there's no session.
  const [signedIn, setSignedIn] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (res.status === 401) {
          if (!cancelled) setSignedIn(false)
          return
        }
        const data = await res.json().catch(() => null)
        if (!cancelled && data?.ok) setStudentName(data.name || null)
      } catch {
        /* offline / transient — stay optimistic, logout control still renders */
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Fetch lifetime totals fresh on every mount — including the remount that happens
  // when the student navigates back to "/" from /results, which is what makes the
  // post-round numbers show up without a manual refresh.
  useEffect(() => {
    let cancelled = false
    setStatsStatus('loading')
    ;(async () => {
      try {
        const res = await fetch('/api/stats')
        if (!res.ok) {
          if (!cancelled) setStatsStatus('error')
          return
        }
        const data = await res.json().catch(() => null)
        if (cancelled) return
        if (data?.ok) {
          setStats(data)
          setStatsStatus('ready')
        } else {
          setStatsStatus('error')
        }
      } catch {
        if (!cancelled) setStatsStatus('error')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } finally {
      // Mint a fresh session for whoever logs in next on this device — a stale
      // sessionId must never carry over to a different student_id.
      resetSession()
      router.push('/login')
      router.refresh()
    }
  }

  // Target stays 0 until the fetch resolves, so the count-up only ever animates once,
  // from 0 to the real lifetime total — it never runs during loading, because the
  // numeral itself isn't rendered until statsStatus is 'ready' (see below).
  const net = useCountUp(stats.net)
  const potential = useCountUp(stats.potential)
  const accuracy = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        {/* Header Greeting */}
        <div className="mb-8">
          {signedIn && (
            <div className="flex justify-end mb-4">
              <button
                onClick={logout}
                className="group flex items-center gap-2 rounded-xl bg-slate-800/60 border border-slate-700/50 px-4 py-2 shadow-lg backdrop-blur-sm text-sm font-semibold text-slate-300 hover:bg-rose-500/10 hover:border-rose-500/40 hover:text-rose-300 transition-all duration-300"
              >
                <LogOut className="w-4 h-4 transition-colors group-hover:text-rose-300" />
                Log out
              </button>
            </div>
          )}
          <div className="text-center">
            <h1 className="text-4xl font-black text-white mb-2">
              Welcome back{studentName ? `, ${studentName}` : ''}!
            </h1>
            <p className="text-slate-400 text-lg">
              {/* Branches on lifetime rounds, not the per-tab session: a returning
                  student on a new device has an empty sessionStorage but a real
                  history, and should not be greeted as a first-timer. While stats
                  are still loading, use the neutral returning-player line. */}
              {statsStatus === 'ready' && stats.rounds_played === 0
                ? 'Pick a mode and play your first round.'
                : "Ready to sharpen your mind? Let's keep it going! 🔥"}
            </p>
          </div>
        </div>

        {/* Point Counters (lifetime, from /api/stats) */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="relative rounded-2xl bg-gradient-to-br from-emerald-500/20 via-emerald-600/10 to-emerald-700/5 border border-emerald-500/40 p-6 shadow-xl">
            <p className="text-emerald-300/80 text-sm font-semibold uppercase tracking-wider mb-2">Net Points</p>
            <p className="text-5xl font-black text-emerald-300 mb-1">
              {statsStatus === 'loading' ? (
                <StatSkeleton className="h-11 w-24" />
              ) : statsStatus === 'error' ? (
                '—'
              ) : (
                net.toLocaleString()
              )}
            </p>
            <p className="text-emerald-400/60 text-xs">after negative marking</p>
          </div>
          <div className="relative rounded-2xl bg-gradient-to-br from-amber-500/20 via-amber-600/10 to-amber-700/5 border border-amber-500/40 p-6 shadow-xl">
            <p className="text-amber-300/80 text-sm font-semibold uppercase tracking-wider mb-2">Potential</p>
            <p className="text-5xl font-black text-amber-300 mb-1">
              {statsStatus === 'loading' ? (
                <StatSkeleton className="h-11 w-24" />
              ) : statsStatus === 'error' ? (
                '—'
              ) : (
                potential.toLocaleString()
              )}
            </p>
            <p className="text-amber-400/60 text-xs">without penalties</p>
          </div>
        </div>

        {statsStatus === 'error' && (
          <p className="text-center text-slate-500 text-xs mb-4">
            Couldn&apos;t load your stats right now — try refreshing in a bit.
          </p>
        )}

        {/* Stats Row (lifetime totals, from /api/stats) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4 text-center">
            <p className="text-slate-400 text-xs uppercase font-semibold mb-1">Rounds</p>
            <p className="text-2xl font-black text-white">
              {statsStatus === 'loading' ? <StatSkeleton /> : statsStatus === 'error' ? '—' : stats.rounds_played}
            </p>
            <p className="text-slate-500 text-xs mt-1">played</p>
          </div>
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4 text-center">
            <p className="text-slate-400 text-xs uppercase font-semibold mb-1">Accuracy</p>
            <p className="text-2xl font-black text-white">
              {statsStatus === 'loading' ? <StatSkeleton /> : statsStatus === 'error' ? '—' : `${accuracy}%`}
            </p>
            <p className="text-slate-500 text-xs mt-1">
              {statsStatus === 'ready' ? `${stats.answered} answered` : 'answered'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4 text-center">
            <p className="text-slate-400 text-xs uppercase font-semibold mb-1">Kept going</p>
            <p className="text-2xl font-black text-white">
              {statsStatus === 'loading' ? <StatSkeleton /> : statsStatus === 'error' ? '—' : stats.continues}
            </p>
            <p className="text-slate-500 text-xs mt-1">extra rounds</p>
          </div>
          <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-4 text-center">
            <p className="text-slate-400 text-xs uppercase font-semibold mb-1">Sessions</p>
            <p className="text-2xl font-black text-white">
              {statsStatus === 'loading' ? <StatSkeleton /> : statsStatus === 'error' ? '—' : stats.sessions}
            </p>
            <p className="text-slate-500 text-xs mt-1">played</p>
          </div>
        </div>

        {/* Play Mode Cards */}
        <div className="space-y-3 mb-8">
          <button
            onClick={() => router.push('/game-setup?mode=rapid')}
            className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 p-1 shadow-lg hover:shadow-2xl transition-all duration-300"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative bg-gradient-to-r from-purple-600/95 to-pink-600/95 rounded-xl px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-white/20 p-2 group-hover:bg-white/30 transition-colors">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-black text-white text-lg">Rapid Round</h3>
                    <p className="text-purple-200 text-sm">Quick fire · 10 questions</p>
                  </div>
                </div>
                <Play className="w-5 h-5 text-white group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={() => router.push('/game-setup?mode=normal')}
            className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 p-1 shadow-lg hover:shadow-2xl transition-all duration-300"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative bg-gradient-to-r from-blue-600/95 to-cyan-600/95 rounded-xl px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-white/20 p-2 group-hover:bg-white/30 transition-colors">
                    <Clock className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-black text-white text-lg">Normal Mode</h3>
                    <p className="text-blue-200 text-sm">Deeper dive · 20 questions</p>
                  </div>
                </div>
                <Play className="w-5 h-5 text-white group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>
        </div>

        <div className="text-center">
          <p className="text-slate-400 text-sm">Set your challenge lever in the next step</p>
        </div>
      </div>
    </main>
  )
}
