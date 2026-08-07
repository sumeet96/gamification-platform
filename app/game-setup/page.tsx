'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, Zap, Brain, Timer } from 'lucide-react'
import { useGame } from '@/lib/game/game-context'
import { FIXED_DIFFICULTY, POINTS_CORRECT, PENALTY_WRONG, roundLength, QUIZ_OWNER_ID, type Lever, type Mode } from '@/lib/game/engine'

function SetupInner() {
  const router = useRouter()
  const params = useSearchParams()
  const { setConfig } = useGame()

  const mode: Mode = params.get('mode') === 'rapid' ? 'rapid' : 'normal'
  const [lever, setLever] = useState<Lever>('adaptive')
  const isRapid = mode === 'rapid'
  const questionsCount = roundLength(mode)

  const start = () => {
    setConfig({ mode, lever, fixedDifficulty: FIXED_DIFFICULTY, ownerGameId: QUIZ_OWNER_ID })
    router.push('/quiz')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors mb-8"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="text-sm font-semibold">Back</span>
        </button>

        <div className="mb-10 text-center">
          <h1 className="text-4xl font-black text-white mb-2">Configure Your Challenge</h1>
          <p className="text-slate-400">Choose your challenge lever, then start the round</p>
        </div>

        {/* Mode Display */}
        <div className="mb-8 rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
          <p className="text-slate-400 text-sm uppercase font-semibold tracking-wider mb-3">Selected Mode</p>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/20 p-3">
              <Zap className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-white font-black text-xl">{isRapid ? 'Rapid Round' : 'Normal Mode'}</p>
              <p className="text-slate-400 text-sm">{questionsCount} questions</p>
            </div>
          </div>
        </div>

        {/* Challenge Lever */}
        <div className="mb-10">
          <h2 className="text-white font-black text-xl mb-4">Challenge Lever</h2>
          <p className="text-slate-400 text-sm mb-6">Pick one — you can switch it between rounds</p>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setLever('adaptive')}
              className={`relative rounded-2xl p-1 transition-all duration-300 ${
                lever === 'adaptive'
                  ? 'ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/20'
                  : 'border border-slate-700/50'
              }`}
            >
              <div className={`rounded-xl px-6 py-5 transition-all duration-300 ${
                lever === 'adaptive' ? 'bg-gradient-to-br from-emerald-600/20 to-emerald-700/10' : 'bg-slate-800/50 hover:bg-slate-800/70'
              }`}>
                <Brain className={`w-8 h-8 mb-3 ${lever === 'adaptive' ? 'text-emerald-400' : 'text-slate-500'}`} />
                <h3 className={`font-black text-sm ${lever === 'adaptive' ? 'text-emerald-300' : 'text-slate-300'}`}>Adaptive Difficulty</h3>
                <p className={`text-xs mt-2 ${lever === 'adaptive' ? 'text-emerald-200/70' : 'text-slate-500'}`}>Harder as you win, easier when you slip</p>
              </div>
            </button>

            <button
              onClick={() => setLever('time')}
              className={`relative rounded-2xl p-1 transition-all duration-300 ${
                lever === 'time'
                  ? 'ring-2 ring-orange-400 shadow-lg shadow-orange-500/20'
                  : 'border border-slate-700/50'
              }`}
            >
              <div className={`rounded-xl px-6 py-5 transition-all duration-300 ${
                lever === 'time' ? 'bg-gradient-to-br from-orange-600/20 to-orange-700/10' : 'bg-slate-800/50 hover:bg-slate-800/70'
              }`}>
                <Timer className={`w-8 h-8 mb-3 ${lever === 'time' ? 'text-orange-400' : 'text-slate-500'}`} />
                <h3 className={`font-black text-sm ${lever === 'time' ? 'text-orange-300' : 'text-slate-300'}`}>Time Pressure</h3>
                <p className={`text-xs mt-2 ${lever === 'time' ? 'text-orange-200/70' : 'text-slate-500'}`}>Less time per question as you improve</p>
              </div>
            </button>
          </div>
        </div>

        {/* How Points Work (real spec: fixed points + negative marking) */}
        <div className="mb-10 rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
          <h2 className="text-white font-black text-lg mb-4">How Points Work</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-emerald-400 rounded-full" /></div>
              <p className="text-slate-300 text-sm font-semibold">Correct answer: <span className="text-emerald-300">+{POINTS_CORRECT}</span></p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-red-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-red-400 rounded-full" /></div>
              <p className="text-slate-300 text-sm font-semibold">Wrong answer: <span className="text-red-300">−{PENALTY_WRONG}</span> <span className="text-slate-500 font-normal">(negative marking)</span></p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-purple-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-purple-400 rounded-full" /></div>
              <p className="text-slate-300 text-sm font-semibold">
                {lever === 'adaptive' ? 'Difficulty rises as you build a streak' : 'Answer fast — the clock tightens as you improve'}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={start}
          className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 p-1 shadow-xl hover:shadow-2xl transition-all duration-300 mb-4"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-xl px-8 py-4">
            <p className="font-black text-white text-center text-lg">Start Round</p>
          </div>
        </button>
      </div>
    </main>
  )
}

export default function GameSetup() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <SetupInner />
    </Suspense>
  )
}
