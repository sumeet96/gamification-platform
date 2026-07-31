'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Check, X, Clock, Brain } from 'lucide-react'
import { useGame } from '@/lib/game/game-context'
import { QUESTIONS, pickQuestion, type Question } from '@/lib/game/questions'
import {
  roundLength, scoreDelta, nextDifficulty, timeForStreak, quizGameId,
  START_DIFFICULTY, TIME_BASE, POINTS_CORRECT, PENALTY_WRONG,
} from '@/lib/game/engine'

type Feedback = 'none' | 'correct' | 'wrong'
interface RoundTally {
  net: number; potential: number; correct: number; wrong: number
  answered: number; peakDifficulty: number; bestTimeMs: number | null
}

export default function Quiz() {
  const router = useRouter()
  const { config, session, recordRound, emit } = useGame()

  const [pool, setPool] = useState<Question[]>(QUESTIONS)
  const [q, setQ] = useState<Question | null>(null)
  const [index, setIndex] = useState(0)
  const [difficulty, setDifficulty] = useState(START_DIFFICULTY)
  const [streak, setStreak] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<Feedback>('none')
  const [timeLeft, setTimeLeft] = useState(TIME_BASE)
  const [round, setRound] = useState<RoundTally>({
    net: 0, potential: 0, correct: 0, wrong: 0, answered: 0, peakDifficulty: START_DIFFICULTY, bestTimeMs: null,
  })

  const usedRef = useRef<Set<string>>(new Set())
  const qStartRef = useRef(0)
  const limitRef = useRef<number | null>(null) // current question's time limit (time mode)
  const configRef = useRef(config)
  configRef.current = config

  const total = config ? roundLength(config.mode) : 0
  const isTime = config?.lever === 'time'
  const roundNo = session.roundsPlayed + 1

  // Fetch the question pool (AI-generated from Neon, else seed) and initialise the round.
  useEffect(() => {
    if (!config) return
    let cancelled = false
    ;(async () => {
      let p: Question[] = QUESTIONS
      try {
        const res = await fetch('/api/questions')
        const data = await res.json()
        if (Array.isArray(data?.questions) && data.questions.length) p = data.questions
      } catch { /* seed fallback */ }
      if (cancelled) return
      const startDiff = config.lever === 'adaptive' ? START_DIFFICULTY : config.fixedDifficulty
      usedRef.current = new Set()
      const first = pickQuestion(p, startDiff, usedRef.current)
      if (first) usedRef.current.add(first.id)
      limitRef.current = config.lever === 'time' ? timeForStreak(0) : null
      setPool(p)
      setDifficulty(startDiff)
      setStreak(0)
      setIndex(0)
      setRound({ net: 0, potential: 0, correct: 0, wrong: 0, answered: 0, peakDifficulty: startDiff, bestTimeMs: null })
      setQ(first)
      setPicked(null)
      setFeedback('none')
      setTimeLeft(config.lever === 'time' ? timeForStreak(0) : TIME_BASE)
      qStartRef.current = Date.now()
      emit({ event_type: 'round_start', game_type: quizGameId(config.mode), mode: config.mode, lever: config.lever, round: roundNo, difficulty_level: startDiff })
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  // No config (cold load / refreshed away) -> back to dashboard.
  useEffect(() => {
    if (config) return
    const t = setTimeout(() => { if (!configRef.current) router.replace('/') }, 700)
    return () => clearTimeout(t)
  }, [config, router])

  function commit(correct: boolean) {
    if (feedback !== 'none' || !config || !q) return
    const d = scoreDelta(correct)
    const elapsed = Date.now() - qStartRef.current
    const netAfter = round.net + d.net
    setRound((r) => ({
      net: r.net + d.net,
      potential: r.potential + d.potential,
      correct: r.correct + (correct ? 1 : 0),
      wrong: r.wrong + (correct ? 0 : 1),
      answered: r.answered + 1,
      peakDifficulty: Math.max(r.peakDifficulty, difficulty),
      bestTimeMs: correct && isTime ? (r.bestTimeMs == null ? elapsed : Math.min(r.bestTimeMs, elapsed)) : r.bestTimeMs,
    }))
    setStreak(correct ? streak + 1 : 0)
    if (config.lever === 'adaptive') setDifficulty((prev) => nextDifficulty(prev, correct))
    setFeedback(correct ? 'correct' : 'wrong')
    emit({
      event_type: 'question_answered', game_type: quizGameId(config.mode), mode: config.mode, lever: config.lever,
      round: roundNo, question_id: q.id, difficulty_level: difficulty,
      time_limit: limitRef.current, time_taken_ms: elapsed, is_correct: correct,
      points_delta: d.net, negative_applied: !correct, net_after: netAfter,
    })
  }

  // Timer (time-pressure mode). Timeout = wrong answer.
  useEffect(() => {
    if (!config || config.lever !== 'time' || feedback !== 'none' || !q) return
    const iv = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { setPicked(-1); commit(false); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, feedback, q])

  function handleAnswer(i: number) {
    if (feedback !== 'none' || !q) return
    setPicked(i)
    commit(i === q.answer)
  }

  function next() {
    if (!config) return
    const nextIndex = index + 1
    if (nextIndex >= total) return finish()
    const targetDiff = config.lever === 'adaptive' ? difficulty : config.fixedDifficulty
    const nq = pickQuestion(pool, targetDiff, usedRef.current)
    if (!nq) return finish()
    usedRef.current.add(nq.id)
    limitRef.current = isTime ? timeForStreak(streak) : null
    setQ(nq)
    setIndex(nextIndex)
    setPicked(null)
    setFeedback('none')
    setTimeLeft(isTime ? timeForStreak(streak) : TIME_BASE)
    qStartRef.current = Date.now()
  }

  function finish() {
    if (!config) return
    recordRound({
      net: round.net, potential: round.potential, correct: round.correct, wrong: round.wrong,
      answered: round.answered, peakDifficulty: round.peakDifficulty, bestTimeMs: round.bestTimeMs,
      lever: config.lever, mode: config.mode, round: roundNo,
    })
    router.push('/results')
  }

  function exit() {
    // This round hasn't been committed via recordRound yet (that only happens in
    // finish()), so roundNo — computed from session.roundsPlayed the same way
    // round_start above was — is the only correct number here. See app/results/page.tsx
    // for the already-committed counterpart, which reads it off lastRound instead.
    emit({ event_type: 'round_stop', game_type: config ? quizGameId(config.mode) : null, mode: config?.mode ?? null, lever: config?.lever ?? null, round: roundNo })
    router.push('/')
  }

  if (!config || !q) {
    return <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 grid place-items-center"><p className="text-slate-500">Preparing round…</p></main>
  }

  const progress = ((index + 1) / total) * 100

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        {/* Header: exit, score, lever indicator */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={exit} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-semibold">Exit</span>
          </button>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-slate-400 text-xs uppercase font-semibold">Score</p>
              <p className={`text-2xl font-black ${round.net < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{round.net}</p>
            </div>
            {isTime ? (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${timeLeft <= 3 ? 'bg-red-500/20 border border-red-500/40' : 'bg-slate-800/50 border border-slate-700/50'}`}>
                <Clock className={`w-4 h-4 ${timeLeft <= 3 ? 'text-red-400 animate-pulse' : 'text-slate-400'}`} />
                <p className={`font-black text-sm ${timeLeft <= 3 ? 'text-red-300' : 'text-slate-200'}`}>{timeLeft}s</p>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <Brain className="w-4 h-4 text-emerald-400" />
                <p className="font-black text-sm text-emerald-300">Level {difficulty}</p>
              </div>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <p className="text-slate-400 text-xs uppercase font-semibold">Question {index + 1} of {total}</p>
            <p className="text-slate-400 text-xs">{Math.round(progress)}%</p>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
            <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Question */}
        <div className="mb-8 rounded-2xl bg-slate-800/50 border border-slate-700/50 p-8">
          <p className="text-slate-400 text-sm uppercase font-semibold tracking-wider mb-4">Question</p>
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">{q.prompt}</h2>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-8">
          {q.options.map((option, i) => {
            const isSelected = picked === i
            const isCorrect = i === q.answer
            let cls = 'bg-slate-800/50 border-slate-700/50 hover:border-slate-600/50 text-slate-200'
            if (feedback !== 'none') {
              if (isCorrect) cls = 'bg-emerald-600/20 border-emerald-500/40 text-emerald-200'
              else if (isSelected) cls = 'bg-red-600/20 border-red-500/40 text-red-200'
              else cls = 'bg-slate-800/30 border-slate-700/30 opacity-50 text-slate-400'
            }
            return (
              <button
                key={i}
                onClick={() => handleAnswer(i)}
                disabled={feedback !== 'none'}
                className={`w-full rounded-xl border p-4 transition-all duration-300 ${cls} ${feedback === 'none' ? 'cursor-pointer hover:shadow-lg' : 'cursor-default'}`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-700/30 flex items-center justify-center font-black">{String.fromCharCode(65 + i)}</div>
                  <span className="flex-1 text-left text-lg font-semibold">{option}</span>
                  {feedback !== 'none' && isCorrect && <Check className="w-6 h-6 text-emerald-400 flex-shrink-0" />}
                  {feedback !== 'none' && isSelected && !isCorrect && <X className="w-6 h-6 text-red-400 flex-shrink-0" />}
                </div>
              </button>
            )
          })}
        </div>

        {/* Feedback + Next */}
        {feedback !== 'none' && (
          <div className="space-y-4">
            <div className={`rounded-xl p-4 border text-center ${feedback === 'correct' ? 'bg-emerald-600/20 border-emerald-500/40' : 'bg-red-600/20 border-red-500/40'}`}>
              <p className={`font-black text-lg ${feedback === 'correct' ? 'text-emerald-300' : 'text-red-300'}`}>
                {feedback === 'correct' ? `🎉 Correct! +${POINTS_CORRECT}` : (picked === -1 ? `⏱ Time up! −${PENALTY_WRONG}` : `❌ Wrong −${PENALTY_WRONG}`)}
              </p>
            </div>
            <button onClick={next} className="w-full group relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 p-1 shadow-lg hover:shadow-2xl transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg px-6 py-3">
                <p className="font-black text-white text-center">{index === total - 1 ? 'See Results' : 'Next Question'}</p>
              </div>
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
