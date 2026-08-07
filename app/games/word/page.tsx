'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Check, X, Clock, Brain, Trophy, Zap, ArrowRight, Sparkles, Type, Lightbulb, AlertTriangle,
} from 'lucide-react'
import { useGame } from '@/lib/game/game-context'
import {
  roundLength,
  initialLeverState, resolveLever, advanceLeverState, type LeverState,
  FIXED_DIFFICULTY, type GameConfig, type Lever, type Mode, type RoundSummary,
} from '@/lib/game/engine'
import { getGame, type FlatPoints } from '@/lib/games/registry'

const WORD_GAME_ID = 'choose-word'
const WORD_POINTS = getGame(WORD_GAME_ID).points as FlatPoints

interface WordQuestion { itemId: string; clue: string; options: string[] }
interface AnswerResult { correct: boolean; correctText: string; pointsDelta: number; netAfter: number }

// Mirrors app/quiz/page.tsx's Feedback: 'none' while the question is live,
// 'correct'/'wrong' once /api/word/answer has scored it. Not a separate
// `phase` value -- exactly like the quiz, feedback gates the option styling
// and the Next button while `phase` itself stays 'playing'.
type Feedback = 'none' | 'correct' | 'wrong'

// 'timedOut' (mirrors app/games/match/page.tsx FIX 1): terminal state for a
// submit that failed BECAUSE the clock hit zero -- distinct from 'playing' so
// the countdown effect's re-arm never fires again for this question.
// 'duplicateAnswer': the one case neither sibling page has to handle -- a
// retry from 'timedOut' can land on a request whose ORIGINAL attempt actually
// scored server-side (the client only ever saw the failed fetch). The server
// contract's 409 `duplicate: true` is exactly this. Retrying again would just
// 409 forever (an infinite loop of the kind the spec calls out), and the true
// pointsDelta/correctText for that question is gone -- the scoring POST that
// had it already came and went. Terminal, distinct message, single way out.
type Phase = 'setup' | 'loading' | 'playing' | 'roundResult' | 'timedOut' | 'duplicateAnswer'

interface RoundTotals {
  net: number; potential: number; correct: number; wrong: number; answered: number
  peakDifficulty: number; bestTimeMs: number | null
}

export default function WordGame() {
  const router = useRouter()
  const {
    getConfig, session, sessionId, studentId, setConfig,
    recordRound, registerContinue, announceRoundOffer, emit, abandonRound,
  } = useGame()
  // FIX 5 (A5 review): only a config this game's own setup screen set,
  // tagged WORD_GAME_ID, is ever handed back -- see lib/game/engine.ts's
  // configBelongsTo.
  const config = getConfig(WORD_GAME_ID)

  const [phase, setPhase] = useState<Phase>('setup')
  const [leverChoice, setLeverChoice] = useState<Lever>('adaptive')
  const [modeChoice, setModeChoice] = useState<Mode>('normal')
  const [leverState, setLeverState] = useState<LeverState>({ difficulty: FIXED_DIFFICULTY, streak: 0 })
  const [question, setQuestion] = useState<WordQuestion | null>(null)
  // Index into question.options, not the option text -- avoids any ambiguity
  // if two options ever share text, same reasoning as match's FIX 10 (tile
  // identity is a synthetic id, never the string it displays).
  const [pickedIndex, setPickedIndex] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<Feedback>('none')
  const [correctText, setCorrectText] = useState<string | null>(null)
  const [lastDelta, setLastDelta] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [roundTotals, setRoundTotals] = useState<RoundTotals>({
    net: 0, potential: 0, correct: 0, wrong: 0, answered: 0, peakDifficulty: FIXED_DIFFICULTY, bestTimeMs: null,
  })
  const [roundNo, setRoundNo] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [questionError, setQuestionError] = useState<string | null>(null)
  // FIX 6: whether the SERVER actually honoured a difficulty preference for
  // the current question (item-select.ts's RankedSelection.difficultyHonored,
  // surfaced by GET /api/word/question). All term rows are NULL difficulty
  // today, so this is false in practice -- the "Level N" badge below is
  // gated on it so the student is never shown an adaptivity signal that
  // didn't actually change what they were served.
  const [difficultyHonored, setDifficultyHonored] = useState(false)
  // Forces the countdown effect to re-arm after a failed MANUAL submit --
  // same purpose as match's FIX 9. Without it, phase stays 'playing', no
  // other effect dep changes, and the clock freezes for the rest of the
  // question.
  const [timerResetKey, setTimerResetKey] = useState(0)

  const qStartRef = useRef(0)
  const limitRef = useRef<number | null>(null) // current question's time limit (time mode), same convention as quiz
  const commitGuardRef = useRef(false) // guards against a double submit, same pattern as quiz/match
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // round_net_before for the NEXT question's submit call -- mirrors match's roundNetRef.
  const roundNetRef = useRef(0)
  // FIX 3: item ids whose result has already been applied to roundTotals/
  // roundNetRef THIS round. Both the normal-success branch and the duplicate
  // branch of submitAnswer check this before touching roundTotals, so a
  // result is accumulated exactly once no matter which branch first sees it
  // -- gated on "have I applied this item's result", never on "did this
  // fetch return ok", so a client that DID receive the original response and
  // then retried anyway cannot double-count the same delta. Reset per round
  // in beginRound.
  const appliedItemIdsRef = useRef<Set<string>>(new Set())

  const isTime = config?.lever === 'time'
  const total = config ? roundLength(config.mode) : 0

  // ---- Question fetch -----------------------------------------------------
  // Takes `cfg`/`state`/`round` explicitly rather than reading context/state --
  // same reasoning as match's fetchBoard: the caller (beginRound) hasn't seen
  // its own setState calls commit to a render yet, so closing over context
  // here would risk a stale (often null) config on the very first call.
  async function fetchQuestion(cfg: GameConfig, state: LeverState, round: number) {
    setPhase('loading')
    setQuestionError(null)
    // Item-grained: the 'item' timing profile, never 'board' -- that
    // profile's constants are sized for a six-pair match board.
    const { difficulty, timeLimit } = resolveLever(cfg, state, 'item')
    try {
      const params = new URLSearchParams({ difficulty: String(difficulty), session_id: sessionId, round: String(round) })
      const res = await fetch(`/api/word/question?${params.toString()}`)
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        // FIX 5: the per-round item pool ran dry -- every eligible term row
        // for THIS (session, round) has already been answered (normal mode
        // is 20 questions against ~50 term rows across two subjects, so this
        // is routine, not exceptional). Distinct from 'not enough term
        // items' (the content pool itself is too small) below. This is a
        // legitimate, if short, round -- finish with whatever was actually
        // answered and let the normal roundResult -> round_offer ->
        // continue/stop flow run. Must NOT call abandonRound: that would log
        // a completed round as an abandonment, corrupting the persistence
        // measure in the opposite direction from the bug it was built to catch.
        if (data?.error === 'round exhausted') {
          finishRound()
          return
        }
        setQuestionError(
          data?.error === 'not enough term items'
            ? 'Not enough term items are ready for this game yet -- try again soon.'
            : 'Could not load a question. Please try again.'
        )
        // This round already logged round_start (beginRound) but can never reach
        // a question now -- it must still consume its round number, same reasoning
        // as match's fetchBoard failure path.
        abandonRound(round, { game_type: WORD_GAME_ID, mode: cfg.mode, lever: cfg.lever })
        setPhase('setup')
        return
      }
      setQuestion({ itemId: data.itemId, clue: data.clue, options: data.options })
      // FIX 6: only ever true once the question route actually exposes
      // item-select.ts's difficultyHonored decision -- absent, this defaults
      // to false and the Level badge stays hidden, never a client-side guess.
      setDifficultyHonored(typeof data.difficultyHonored === 'boolean' ? data.difficultyHonored : false)
      setPickedIndex(null)
      setFeedback('none')
      setCorrectText(null)
      setLastDelta(0)
      // time_limit is only meaningful (and only logged) for the time lever --
      // same logging convention as quiz.
      limitRef.current = cfg.lever === 'time' ? timeLimit : null
      setTimeLeft(timeLimit)
      qStartRef.current = Date.now()
      setPhase('playing')
    } catch (err) {
      console.error('word: question fetch failed', err)
      setQuestionError('Could not load a question. Please try again.')
      abandonRound(round, { game_type: WORD_GAME_ID, mode: cfg.mode, lever: cfg.lever })
      setPhase('setup')
    }
  }

  // ---- Round lifecycle -----------------------------------------------------

  function beginRound(cfg: GameConfig) {
    const startState = initialLeverState(cfg)
    const nextRoundNo = session.roundsPlayed + 1
    const { difficulty: startDiff } = resolveLever(cfg, startState, 'item')
    setRoundNo(nextRoundNo)
    setRoundTotals({ net: 0, potential: 0, correct: 0, wrong: 0, answered: 0, peakDifficulty: startDiff, bestTimeMs: null })
    roundNetRef.current = 0
    appliedItemIdsRef.current = new Set()
    setLeverState(startState)
    emit({ event_type: 'round_start', game_type: WORD_GAME_ID, mode: cfg.mode, lever: cfg.lever, round: nextRoundNo, difficulty_level: startDiff })
    void fetchQuestion(cfg, startState, nextRoundNo)
  }

  function startRound() {
    const cfg: GameConfig = { mode: modeChoice, lever: leverChoice, fixedDifficulty: FIXED_DIFFICULTY, ownerGameId: WORD_GAME_ID }
    setConfig(cfg)
    beginRound(cfg)
  }

  function keepGoing() {
    if (!config) return
    registerContinue()
    beginRound(config)
  }

  // Decline-after-offer: a direct emit(), never abandonRound -- this is a
  // genuine choice made from the Keep Going screen, and must stay
  // distinguishable in the data from an abandoned round (see the comment on
  // abandonRound in lib/game/game-context.tsx).
  function stopRound() {
    if (!config) return
    emit({ event_type: 'round_stop', game_type: WORD_GAME_ID, mode: config.mode, lever: config.lever, round: roundNo })
    router.push('/')
  }

  // Header "Exit" -- only abandons a round if one was actually under way
  // (roundNo > 0); leaving the setup screen before Start has nothing to stop.
  function exitMidRound() {
    if (config && roundNo > 0) {
      abandonRound(roundNo, { game_type: WORD_GAME_ID, mode: config.mode, lever: config.lever })
    }
    router.push('/')
  }

  function finishRound() {
    if (!config) return
    const summary: RoundSummary = {
      net: roundTotals.net,
      potential: roundTotals.potential,
      correct: roundTotals.correct,
      wrong: roundTotals.wrong,
      answered: roundTotals.answered,
      peakDifficulty: roundTotals.peakDifficulty,
      bestTimeMs: roundTotals.bestTimeMs,
      lever: config.lever,
      mode: config.mode,
      round: roundNo,
    }
    recordRound(summary)
    setPhase('roundResult')
  }

  // Announce the Keep Going affordance the instant it actually renders --
  // mirrors match/quiz. announceRoundOffer's own ref guard (game-context.tsx)
  // makes this fire once per round even though this effect is allowed to
  // re-run.
  useEffect(() => {
    if (phase !== 'roundResult' || !config) return
    announceRoundOffer(roundNo, { game_type: WORD_GAME_ID, mode: config.mode, lever: config.lever })
  }, [phase, roundNo, config, announceRoundOffer])

  // ---- Answer submit --------------------------------------------------------

  // `trigger` (mirrors match's FIX 1) distinguishes WHY this submit fired:
  // 'timeout' means the countdown reached zero and force-submitted; 'manual'
  // means the student clicked an option (or hit Retry on the timed-out
  // screen). Read off the CALL SITE, never re-derived from `timeLeft` after
  // the fact.
  async function submitAnswer(cfg: GameConfig, state: LeverState, selectedIndex: number | null, trigger: 'manual' | 'timeout' = 'manual') {
    if (!question || commitGuardRef.current) return
    commitGuardRef.current = true
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setSubmitting(true)
    const elapsed = Date.now() - qStartRef.current
    const selectedText = selectedIndex != null ? question.options[selectedIndex] : null
    try {
      const res = await fetch('/api/word/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          client_student_id: studentId ?? undefined,
          round: roundNo,
          item_id: question.itemId,
          selected_text: selectedText,
          mode: cfg.mode,
          lever: cfg.lever,
          difficulty_level: state.difficulty,
          time_limit: limitRef.current,
          time_taken_ms: elapsed,
          round_net_before: roundNetRef.current,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        console.error('word: /api/word/answer failed', data)
        if (data?.duplicate) {
          // FIX 3: the original attempt for this question already scored
          // server-side, and the 409 payload now carries what it recorded
          // (correct/correctText/pointsDelta/netAfter -- same shape as
          // AnswerResult) instead of nothing. Reconcile the round with it
          // rather than losing the score, but only once per item -- gated on
          // appliedItemIdsRef, not on "did this fetch return ok", so a client
          // that already applied the original response and retried anyway
          // (e.g. a fast double-click on Retry Submit) cannot double-count
          // the same delta.
          const recorded = data as AnswerResult
          if (!appliedItemIdsRef.current.has(question.itemId)) {
            appliedItemIdsRef.current.add(question.itemId)
            // Authoritative running total from the server, NOT round_net_before
            // + pointsDelta -- this client's round_net_before may already have
            // drifted from what the server actually has on file.
            roundNetRef.current = recorded.netAfter
            setRoundTotals((t) => ({
              net: t.net + recorded.pointsDelta,
              potential: t.potential + (recorded.correct ? recorded.pointsDelta : 0),
              correct: t.correct + (recorded.correct ? 1 : 0),
              wrong: t.wrong + (recorded.correct ? 0 : 1),
              answered: t.answered + 1, // count it, so the round length is right
              peakDifficulty: Math.max(t.peakDifficulty, state.difficulty),
              bestTimeMs: t.bestTimeMs, // no authoritative timing for the original attempt
            }))
          }
          setPhase('duplicateAnswer')
        } else if (trigger === 'timeout') {
          // Clock was already at zero -- re-arming would let the countdown
          // effect's `prev <= 1` branch call this exact same failing submit
          // again next tick, forever. Terminal instead: stop, explain, offer
          // retry/exit.
          setPhase('timedOut')
        } else {
          // Clock is still running (or isn't in play) -- re-arm so the
          // countdown effect gets a fresh interval instead of freezing.
          setTimerResetKey((k) => k + 1)
        }
        return
      }
      const result = data as AnswerResult
      // FIX 3: same itemId gate as the duplicate branch above -- belt and
      // suspenders against a genuine success response for a question whose
      // result was already applied via that branch.
      if (!appliedItemIdsRef.current.has(question.itemId)) {
        appliedItemIdsRef.current.add(question.itemId)
        roundNetRef.current += result.pointsDelta
        setRoundTotals((t) => ({
          net: t.net + result.pointsDelta,
          potential: t.potential + (result.correct ? result.pointsDelta : 0),
          correct: t.correct + (result.correct ? 1 : 0),
          wrong: t.wrong + (result.correct ? 0 : 1),
          answered: t.answered + 1,
          peakDifficulty: Math.max(t.peakDifficulty, state.difficulty),
          bestTimeMs: result.correct && cfg.lever === 'time'
            ? (t.bestTimeMs == null ? elapsed : Math.min(t.bestTimeMs, elapsed))
            : t.bestTimeMs,
        }))
        setLeverState((prev) => advanceLeverState(cfg, prev, result.correct))
      }
      // correctText only comes back on the POST that actually scores -- reveal
      // it from the response, never from anything held client-side.
      setCorrectText(result.correctText)
      setLastDelta(result.pointsDelta)
      setFeedback(result.correct ? 'correct' : 'wrong')
      // FIX 2: a successful retry from 'timedOut' must actually leave that
      // screen -- this branch previously set feedback/roundTotals/leverState
      // but never `phase`, so a retry that succeeded still rendered "Time ran
      // out, and it didn't save" with only Retry (now a guaranteed 409) and
      // Exit (which would abandon a round the student just scored in) as the
      // way out. Unconditional and harmless when already 'playing'.
      setPhase('playing')
    } catch (err) {
      console.error('word: /api/word/answer request failed', err)
      if (trigger === 'timeout') setPhase('timedOut')
      else setTimerResetKey((k) => k + 1)
    } finally {
      commitGuardRef.current = false
      setSubmitting(false)
    }
  }

  function handleAnswer(i: number) {
    if (!config || phase !== 'playing' || feedback !== 'none' || submitting) return
    setPickedIndex(i)
    void submitAnswer(config, leverState, i)
  }

  // Explicit retry from the timed-out screen. Reuses whatever was (or was
  // not, on a genuine timeout) selected -- no new question fetch.
  function retryTimedOutSubmit() {
    if (!config) return
    void submitAnswer(config, leverState, pickedIndex)
  }

  // No new question fetch, no re-submit -- the answer this question would
  // have scored is unrecoverable client-side. The round simply continues one
  // question short of the loss; `nextQuestion`'s total check absorbs it.
  function continueAfterDuplicate() {
    setFeedback('none')
    nextQuestion()
  }

  // Timer (time-pressure lever only), item-grained -- one question, not a
  // whole board. `selectedIndex` is passed directly to submitAnswer rather
  // than read from `pickedIndex` state inside the closure, so this never
  // depends on a value the interval might see stale (the class of bug match
  // fixed with its "latest ref" pattern -- match's staleness was reading a
  // *mutating placements object* through a closure that didn't rebuild on
  // every placement; here nothing is read back out of state at submit time,
  // it's just `null`). `feedback` and `question` ARE in the deps below, so
  // the interval tears down and rebuilds on every question and on every
  // scored answer -- and commitGuardRef (checked synchronously, set at the
  // very top of submitAnswer) is the belt-and-suspenders against the timer
  // firing in the same tick a manual click already started a submit.
  useEffect(() => {
    if (phase !== 'playing' || !config || config.lever !== 'time' || feedback !== 'none' || !question) return
    const iv = setInterval(() => {
      if (commitGuardRef.current) return
      setTimeLeft((prev) => {
        if (prev <= 1) { void submitAnswer(config, leverState, null, 'timeout'); return 0 }
        return prev - 1
      })
    }, 1000)
    timerRef.current = iv
    return () => { clearInterval(iv); if (timerRef.current === iv) timerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, config, feedback, question, timerResetKey])

  function nextQuestion() {
    if (!config) return
    if (roundTotals.answered >= total) {
      finishRound()
    } else {
      void fetchQuestion(config, leverState, roundNo)
    }
  }

  // ---- Setup screen ---------------------------------------------------------

  if (phase === 'setup') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <button onClick={() => router.push('/')} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors mb-8">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-semibold">Back</span>
          </button>

          <div className="mb-10 text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-600 p-4 shadow-lg shadow-teal-500/20">
                <Type className="w-8 h-8 text-white" />
              </div>
            </div>
            <h1 className="text-4xl font-black text-white mb-2">Choose the Right Word</h1>
            <p className="text-slate-400">Read the clue, pick the term it describes. Choose your challenge lever, then start.</p>
          </div>

          {questionError && (
            <div className="mb-8 rounded-xl bg-red-600/20 border border-red-500/40 p-4 text-center text-red-200 text-sm font-semibold">
              {questionError}
            </div>
          )}

          <div className="mb-10">
            <h2 className="text-white font-black text-xl mb-4">Pace</h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setModeChoice('normal')}
                className={`relative rounded-2xl p-1 transition-all duration-300 ${modeChoice === 'normal' ? 'ring-2 ring-sky-400 shadow-lg shadow-sky-500/20' : 'border border-slate-700/50'}`}
              >
                <div className={`rounded-xl px-6 py-5 transition-all duration-300 ${modeChoice === 'normal' ? 'bg-gradient-to-br from-sky-600/20 to-sky-700/10' : 'bg-slate-800/50 hover:bg-slate-800/70'}`}>
                  <Sparkles className={`w-8 h-8 mb-3 ${modeChoice === 'normal' ? 'text-sky-400' : 'text-slate-500'}`} />
                  <h3 className={`font-black text-sm ${modeChoice === 'normal' ? 'text-sky-300' : 'text-slate-300'}`}>Normal</h3>
                  <p className={`text-xs mt-2 ${modeChoice === 'normal' ? 'text-sky-200/70' : 'text-slate-500'}`}>The standard pace</p>
                </div>
              </button>
              <button
                onClick={() => setModeChoice('rapid')}
                className={`relative rounded-2xl p-1 transition-all duration-300 ${modeChoice === 'rapid' ? 'ring-2 ring-fuchsia-400 shadow-lg shadow-fuchsia-500/20' : 'border border-slate-700/50'}`}
              >
                <div className={`rounded-xl px-6 py-5 transition-all duration-300 ${modeChoice === 'rapid' ? 'bg-gradient-to-br from-fuchsia-600/20 to-fuchsia-700/10' : 'bg-slate-800/50 hover:bg-slate-800/70'}`}>
                  <Zap className={`w-8 h-8 mb-3 ${modeChoice === 'rapid' ? 'text-fuchsia-400' : 'text-slate-500'}`} />
                  <h3 className={`font-black text-sm ${modeChoice === 'rapid' ? 'text-fuchsia-300' : 'text-slate-300'}`}>Rapid</h3>
                  <p className={`text-xs mt-2 ${modeChoice === 'rapid' ? 'text-fuchsia-200/70' : 'text-slate-500'}`}>Logged as the rapid arm</p>
                </div>
              </button>
            </div>
          </div>

          <div className="mb-10">
            <h2 className="text-white font-black text-xl mb-4">Challenge Lever</h2>
            <p className="text-slate-400 text-sm mb-6">The lever moves between questions, not within one.</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setLeverChoice('adaptive')}
                className={`relative rounded-2xl p-1 transition-all duration-300 ${leverChoice === 'adaptive' ? 'ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/20' : 'border border-slate-700/50'}`}
              >
                <div className={`rounded-xl px-6 py-5 transition-all duration-300 ${leverChoice === 'adaptive' ? 'bg-gradient-to-br from-emerald-600/20 to-emerald-700/10' : 'bg-slate-800/50 hover:bg-slate-800/70'}`}>
                  <Brain className={`w-8 h-8 mb-3 ${leverChoice === 'adaptive' ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <h3 className={`font-black text-sm ${leverChoice === 'adaptive' ? 'text-emerald-300' : 'text-slate-300'}`}>Adaptive Difficulty</h3>
                  <p className={`text-xs mt-2 ${leverChoice === 'adaptive' ? 'text-emerald-200/70' : 'text-slate-500'}`}>Clues get harder as you win, easier when you slip</p>
                </div>
              </button>
              <button
                onClick={() => setLeverChoice('time')}
                className={`relative rounded-2xl p-1 transition-all duration-300 ${leverChoice === 'time' ? 'ring-2 ring-orange-400 shadow-lg shadow-orange-500/20' : 'border border-slate-700/50'}`}
              >
                <div className={`rounded-xl px-6 py-5 transition-all duration-300 ${leverChoice === 'time' ? 'bg-gradient-to-br from-orange-600/20 to-orange-700/10' : 'bg-slate-800/50 hover:bg-slate-800/70'}`}>
                  <Clock className={`w-8 h-8 mb-3 ${leverChoice === 'time' ? 'text-orange-400' : 'text-slate-500'}`} />
                  <h3 className={`font-black text-sm ${leverChoice === 'time' ? 'text-orange-300' : 'text-slate-300'}`}>Time Pressure</h3>
                  <p className={`text-xs mt-2 ${leverChoice === 'time' ? 'text-orange-200/70' : 'text-slate-500'}`}>The clock tightens as you improve</p>
                </div>
              </button>
            </div>
          </div>

          <div className="mb-10 rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
            <h2 className="text-white font-black text-lg mb-4">How Points Work</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-emerald-400 rounded-full" /></div>
                <p className="text-slate-300 text-sm font-semibold">Correct: <span className="text-emerald-300">+{WORD_POINTS.correct}</span></p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-red-400 rounded-full" /></div>
                <p className="text-slate-300 text-sm font-semibold">Wrong: <span className="text-red-300">{WORD_POINTS.wrong}</span></p>
              </div>
            </div>
          </div>

          <button
            onClick={startRound}
            className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-600 p-1 shadow-xl hover:shadow-2xl transition-all duration-300"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-teal-400 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl px-8 py-4">
              <p className="font-black text-white text-center text-lg">Start Round</p>
            </div>
          </button>
        </div>
      </main>
    )
  }

  if (phase === 'loading' || !config || !question) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 grid place-items-center">
        <p className="text-slate-500">Preparing question…</p>
      </main>
    )
  }

  if (phase === 'roundResult') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-cyan-500/30 blur-2xl rounded-full w-32 h-32 mx-auto animate-pulse" />
              <Trophy className="w-20 h-20 text-cyan-400 relative z-10" />
            </div>
          </div>
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black text-white mb-2">Round Complete!</h1>
            <p className="text-slate-400 text-lg">{roundTotals.correct}/{roundTotals.answered} correct</p>
          </div>

          <div className="relative rounded-2xl bg-gradient-to-br from-cyan-500/20 via-teal-600/10 to-teal-700/5 border border-cyan-500/40 p-8 shadow-xl mb-8">
            <div className="relative text-center">
              <p className="text-cyan-300/80 text-sm font-semibold uppercase tracking-wider mb-3">Net Points This Round</p>
              <p className={`text-7xl font-black mb-2 ${roundTotals.net < 0 ? 'text-red-300' : 'text-cyan-300'}`}>{roundTotals.net}</p>
              <p className="text-cyan-400/60 text-sm">Potential: {roundTotals.potential}</p>
            </div>
          </div>

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
            onClick={stopRound}
            className="w-full px-6 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-300 font-semibold hover:bg-slate-700/50 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </main>
    )
  }

  if (phase === 'timedOut') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/30 blur-2xl rounded-full w-32 h-32 mx-auto animate-pulse" />
              <AlertTriangle className="w-20 h-20 text-red-400 relative z-10" />
            </div>
          </div>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-white mb-2">Time ran out, and it didn&apos;t save</h1>
            <p className="text-slate-400">
              The clock hit zero, but the answer couldn&apos;t be recorded (a connection hiccup, most likely).
              Retry the submission, or exit and this round ends here.
            </p>
          </div>
          <button
            onClick={retryTimedOutSubmit}
            disabled={submitting}
            className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-500 to-red-600 p-1 shadow-xl hover:shadow-2xl transition-all duration-300 disabled:opacity-60 mb-4"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-orange-400 to-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative bg-gradient-to-r from-orange-500/95 to-red-600/95 rounded-xl px-6 py-4">
              <p className="font-black text-white text-center text-lg">{submitting ? 'Retrying…' : 'Retry Submit'}</p>
            </div>
          </button>
          <button
            onClick={exitMidRound}
            className="w-full px-6 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-300 font-semibold hover:bg-slate-700/50 transition-colors"
          >
            Exit to Dashboard
          </button>
        </div>
      </main>
    )
  }

  if (phase === 'duplicateAnswer') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-amber-500/30 blur-2xl rounded-full w-32 h-32 mx-auto animate-pulse" />
              <AlertTriangle className="w-20 h-20 text-amber-400 relative z-10" />
            </div>
          </div>
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black text-white mb-2">That one already went through</h1>
            <p className="text-slate-400">
              The retry landed after the original answer had already been recorded server-side, so this
              client never saw the score for it. Nothing else is lost -- moving on picks up where the round left off.
            </p>
          </div>
          <button
            onClick={continueAfterDuplicate}
            className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-500 to-cyan-600 p-1 shadow-xl hover:shadow-2xl transition-all duration-300 mb-4"
          >
            <div className="relative bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl px-6 py-4">
              <p className="font-black text-white text-center text-lg">Continue</p>
            </div>
          </button>
          {/* FIX 4: this screen previously had no way out except Continue --
              combined with round exhaustion, a student could get stuck with
              no exit and no round_stop ever written. Same abandonment path
              the header's Exit button uses everywhere else. */}
          <button
            onClick={exitMidRound}
            className="w-full px-6 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-300 font-semibold hover:bg-slate-700/50 transition-colors"
          >
            Exit to Dashboard
          </button>
        </div>
      </main>
    )
  }

  const questionNo = Math.min(roundTotals.answered + 1, total)
  const progress = (questionNo / total) * 100

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        {/* Header: exit, score, lever indicator */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={exitMidRound} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-semibold">Exit</span>
          </button>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-slate-400 text-xs uppercase font-semibold">Round Net</p>
              <p className={`text-2xl font-black ${roundTotals.net < 0 ? 'text-red-300' : 'text-cyan-300'}`}>{roundTotals.net}</p>
            </div>
            {/* Presentation only -- which stat to show (clock vs. level); the
                values themselves (timeLeft, leverState.difficulty) already came
                from the resolver above. FIX 6: the Level badge is further
                gated on difficultyHonored -- leverState.difficulty ramps
                client-side regardless, but item selection today ignores
                difficulty entirely (all term rows are NULL-difficulty), so
                showing "Level N" would tell the student an adaptivity signal
                changed what they were served when it did not. Hidden rather
                than shown-but-wrong when not honoured. */}
            {isTime ? (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${timeLeft <= 3 && feedback === 'none' ? 'bg-red-500/20 border border-red-500/40' : 'bg-slate-800/50 border border-slate-700/50'}`}>
                <Clock className={`w-4 h-4 ${timeLeft <= 3 && feedback === 'none' ? 'text-red-400 animate-pulse' : 'text-slate-400'}`} />
                <p className={`font-black text-sm ${timeLeft <= 3 && feedback === 'none' ? 'text-red-300' : 'text-slate-200'}`}>{timeLeft}s</p>
              </div>
            ) : difficultyHonored ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <Brain className="w-4 h-4 text-emerald-400" />
                <p className="font-black text-sm text-emerald-300">Level {leverState.difficulty}</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <p className="text-slate-400 text-xs uppercase font-semibold">Question {questionNo} of {total}</p>
            <p className="text-slate-400 text-xs">{Math.round(progress)}%</p>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Clue */}
        <div className="mb-8 rounded-2xl bg-slate-800/50 border border-slate-700/50 p-8">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-4 h-4 text-amber-300" />
            <p className="text-slate-400 text-sm uppercase font-semibold tracking-wider">Clue</p>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">{question.clue}</h2>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-8">
          {question.options.map((option, i) => {
            const isSelected = pickedIndex === i
            // Only known once /api/word/answer replies -- safe to reveal AFTER
            // the answer is committed, never before.
            const isCorrect = feedback !== 'none' && option === correctText
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
                disabled={feedback !== 'none' || submitting}
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
                {feedback === 'correct'
                  ? `🎉 Correct! +${lastDelta}`
                  : (pickedIndex === null ? `⏱ Time up! ${lastDelta < 0 ? `−${Math.abs(lastDelta)}` : lastDelta}` : `❌ Wrong ${lastDelta < 0 ? `−${Math.abs(lastDelta)}` : lastDelta}`)}
              </p>
            </div>
            <button onClick={nextQuestion} className="w-full group relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 p-1 shadow-lg hover:shadow-2xl transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg px-6 py-3">
                <p className="font-black text-white text-center">{roundTotals.answered >= total ? 'See Results' : 'Next Question'}</p>
              </div>
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
