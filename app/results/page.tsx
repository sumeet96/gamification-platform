'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Trophy, Zap, ArrowRight } from 'lucide-react'
import { useGame } from '@/lib/game/game-context'
import { POINTS_CORRECT, PENALTY_WRONG, quizGameId } from '@/lib/game/engine'
import { useCountUp } from '@/lib/ui/useCountUp'

export default function Results() {
  const router = useRouter()
  const { lastRound, registerContinue, emit } = useGame()

  // No round recorded (cold load) -> dashboard.
  useEffect(() => {
    if (!lastRound) {
      const t = setTimeout(() => router.replace('/'), 400)
      return () => clearTimeout(t)
    }
  }, [lastRound, router])

  const net = useCountUp(lastRound?.net ?? 0)

  if (!lastRound) {
    return <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 grid place-items-center"><p className="text-slate-500">No round to show…</p></main>
  }

  const gross = lastRound.correct * POINTS_CORRECT
  const penalty = lastRound.wrong * PENALTY_WRONG
  const accuracy = lastRound.answered > 0 ? Math.round((lastRound.correct / lastRound.answered) * 100) : 0
  const peakLabel = lastRound.lever === 'time'
    ? (lastRound.bestTimeMs != null ? `${(lastRound.bestTimeMs / 1000).toFixed(1)}s` : '—')
    : `Lv ${lastRound.peakDifficulty}`
  const peakSub = lastRound.lever === 'time' ? 'fastest answer' : 'peak difficulty'

  const keepGoing = () => { registerContinue(); router.push('/quiz') }
  const stop = () => {
    // This round was already committed via recordRound() before we got here (see
    // finish() in app/quiz/page.tsx), so lastRound.round — set from quiz's roundNo at
    // that point — is the single source of truth, not session.roundsPlayed re-derived
    // after the fact.
    emit({ event_type: 'round_stop', game_type: quizGameId(lastRound.mode), mode: lastRound.mode, lever: lastRound.lever, round: lastRound.round })
    router.push('/')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/30 blur-2xl rounded-full w-32 h-32 mx-auto animate-pulse" />
            <Trophy className="w-20 h-20 text-emerald-400 relative z-10" />
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white mb-2">Round Complete!</h1>
          <p className="text-slate-400 text-lg">
            {accuracy >= 70 ? 'Strong round — keep the momentum going.' : 'Nice effort — another round will sharpen it.'}
          </p>
        </div>

        {/* Round net */}
        <div className="relative rounded-2xl bg-gradient-to-br from-emerald-500/20 via-emerald-600/10 to-emerald-700/5 border border-emerald-500/40 p-8 shadow-xl mb-8">
          <div className="relative text-center">
            <p className="text-emerald-300/80 text-sm font-semibold uppercase tracking-wider mb-3">Net Points This Round</p>
            <p className={`text-7xl font-black mb-2 ${lastRound.net < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{net}</p>
            <p className="text-emerald-400/60 text-sm">{lastRound.correct} correct · {lastRound.wrong} wrong</p>
          </div>
        </div>

        {/* Breakdown */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Score Breakdown</h2>
          <div className="space-y-2">
            <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 flex items-center justify-between">
              <span className="text-slate-300 font-medium">Correct answers <span className="text-slate-500 text-xs">({lastRound.correct} × +{POINTS_CORRECT})</span></span>
              <span className="text-emerald-300 font-black text-xl">+{gross}</span>
            </div>
            <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 flex items-center justify-between">
              <span className="text-slate-300 font-medium">Negative marking <span className="text-slate-500 text-xs">({lastRound.wrong} × −{PENALTY_WRONG})</span></span>
              <span className="text-red-300 font-black text-xl">−{penalty}</span>
            </div>
            <div className="rounded-lg bg-slate-800/70 border border-emerald-500/30 p-4 flex items-center justify-between">
              <span className="text-white font-black">Net this round</span>
              <span className={`font-black text-xl ${lastRound.net < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{lastRound.net}</span>
            </div>
          </div>
        </div>

        {/* Peak stats */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Peak Stats</h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 text-center">
              <p className="text-slate-400 text-xs uppercase font-semibold mb-2">Accuracy</p>
              <p className="text-2xl font-black text-emerald-300">{accuracy}%</p>
              <p className="text-slate-500 text-xs mt-1">this round</p>
            </div>
            <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 text-center">
              <p className="text-slate-400 text-xs uppercase font-semibold mb-2">{lastRound.lever === 'time' ? 'Best Time' : 'Reached'}</p>
              <p className="text-2xl font-black text-blue-300">{peakLabel}</p>
              <p className="text-slate-500 text-xs mt-1">{peakSub}</p>
            </div>
            <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 text-center">
              <p className="text-slate-400 text-xs uppercase font-semibold mb-2">Correct</p>
              <p className="text-2xl font-black text-purple-300">{lastRound.correct}/{lastRound.answered}</p>
              <p className="text-slate-500 text-xs mt-1">answered</p>
            </div>
          </div>
        </div>

        {/* The persistence beat */}
        <button
          onClick={keepGoing}
          className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 p-1 shadow-xl hover:shadow-2xl transition-all duration-300 mb-4"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative bg-gradient-to-r from-emerald-500/95 to-teal-600/95 rounded-xl px-6 py-4">
            <div className="flex items-center justify-center gap-2">
              <Zap className="w-5 h-5 text-white" />
              <span className="font-black text-white text-lg">Keep Going → Next Round</span>
              <ArrowRight className="w-5 h-5 text-white group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </button>

        <button
          onClick={stop}
          className="w-full px-6 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-300 font-semibold hover:bg-slate-700/50 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </main>
  )
}
