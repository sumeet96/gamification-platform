'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Check, X, Clock, Brain, Trophy, Zap, ArrowRight, Sparkles, Link2, Flame, AlertTriangle,
} from 'lucide-react'
import { useGame } from '@/lib/game/game-context'
import {
  initialLeverState, resolveLever, advanceLeverState, type LeverState,
  FIXED_DIFFICULTY, type GameConfig, type Lever, type Mode, type RoundSummary,
} from '@/lib/game/engine'
import { boardSucceeded } from '@/lib/games/match'
import { getGame, type BoardPoints } from '@/lib/games/registry'
import { parseDifficultyHonored } from '@/lib/games/item-select'

const MATCH_GAME_ID = 'match'
const MATCH_POINTS = getGame(MATCH_GAME_ID).points as BoardPoints

// UNCONFIRMED, flagged rather than asserted: how many boards make one "round"
// for match is not specified anywhere in the spec. The quiz's roundLength()
// (10/20 questions, lib/game/engine.ts) is calibrated for single MCQs, not
// six-pair boards, so it is deliberately not reused here -- 20 boards would be
// a very long sitting. Three keeps a round short enough to reasonably ask
// "keep going?" without inventing a rapid/normal split the registry doesn't
// have (match has exactly one GAME_REGISTRY entry, not -rapid/-normal like quiz).
const BOARDS_PER_ROUND = 3

interface ClueItem { itemId: string; clue: string }
// FIX 1: `boardToken` is the server-signed claim over this exact board (issued
// by GET /api/match/board) -- it rides along with the board data and is sent
// back verbatim on submit. Never generated or altered client-side.
interface BoardData { clues: ClueItem[]; terms: string[]; boardToken: string }
interface PairResult { itemId: string; correct: boolean; submitted: string | null; term: string }
// FIX 10: a bank tile's identity is this synthetic `id`, assigned once at
// fetch time -- NOT the term string. Two content_items rows can legitimately
// share a term string (now that boards can be re-served with overlapping
// decks), and keying/filtering by the string itself either collides React
// keys or (worse) removes every copy of a duplicate term when only one tile
// was placed. The id carries no information about which clue it answers --
// it's assigned in whatever (already server-shuffled) order `terms` arrived in.
interface BankTile { id: string; term: string }
interface ScoredBoard {
  total: number; correctCount: number; accrual: number; bonus: number; floor: number
  net: number; potential: number; perfect: boolean; pairs: PairResult[]
}

// 'timedOut' (FIX 1): terminal state for a submit that failed BECAUSE the
// clock hit zero -- distinct from 'playing' so the countdown effect's re-arm
// (FIX 9) never fires again for this board. See submitBoard's `trigger` param.
type Phase = 'setup' | 'loading' | 'playing' | 'revealing' | 'boardResult' | 'roundResult' | 'timedOut'

// What's currently "in hand" -- either a bank tile or a tile picked back up
// out of a slot. Clicking a slot with something selected places it there
// (see placeSelected below); clicking a slot with nothing selected picks its
// tile back up. This is what keeps every submission a legal bijection: a
// term only ever exists in the bank or in exactly one slot, never both.
// FIX 10: the bank case carries the tile's `id`, not just its term string, so
// placing/removing a specific tile never touches another tile that happens to
// have the same text.
type Selected = { source: 'bank'; id: string; term: string } | { source: 'slot'; itemId: string; term: string } | null

interface RoundTotals {
  net: number; potential: number; accrual: number; bonus: number; floor: number
  correctPairs: number; totalPairs: number; boardsPlayed: number; boardsSucceeded: number
  peakDifficulty: number; bestTimeMs: number | null
}

const EMPTY_TOTALS: RoundTotals = {
  net: 0, potential: 0, accrual: 0, bonus: 0, floor: 0,
  correctPairs: 0, totalPairs: 0, boardsPlayed: 0, boardsSucceeded: 0,
  peakDifficulty: FIXED_DIFFICULTY, bestTimeMs: null,
}

export default function MatchGame() {
  const router = useRouter()
  const {
    config, session, sessionId, studentId, setConfig,
    recordRound, registerContinue, announceRoundOffer, emit, abandonRound,
  } = useGame()

  const [phase, setPhase] = useState<Phase>('setup')
  const [leverChoice, setLeverChoice] = useState<Lever>('adaptive')
  // FIX 6: was hardcoded to 'normal' in the submit body below -- the student
  // now picks, same as the quiz (which picks via which dashboard tile is
  // clicked; match has one tile, so it picks here instead).
  const [modeChoice, setModeChoice] = useState<Mode>('normal')
  const [leverState, setLeverState] = useState<LeverState>({ difficulty: FIXED_DIFFICULTY, streak: 0 })
  const [board, setBoard] = useState<BoardData | null>(null)
  // Whether the SERVER actually honoured a difficulty preference for the
  // current board (lib/games/match-board-select.ts's RankedSelection.
  // difficultyHonored, surfaced by GET /api/match/board). All term rows are
  // NULL difficulty today, so this is false in practice -- the "Level N"
  // badge below is gated on it, mirroring app/games/word/page.tsx, so the
  // student is never shown an adaptivity signal that didn't actually change
  // what they were served.
  const [difficultyHonored, setDifficultyHonored] = useState(false)
  const [placements, setPlacements] = useState<Record<string, string | null>>({})
  const [bank, setBank] = useState<BankTile[]>([])
  const [selected, setSelected] = useState<Selected>(null)
  const [submitting, setSubmitting] = useState(false)
  const [scored, setScored] = useState<ScoredBoard | null>(null)
  const [revealIndex, setRevealIndex] = useState(0)
  const [combo, setCombo] = useState(0)
  const [roundTotals, setRoundTotals] = useState<RoundTotals>(EMPTY_TOTALS)
  const [roundNo, setRoundNo] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [boardError, setBoardError] = useState<string | null>(null)
  // FIX 9: bumped whenever a board submit fails so the countdown-timer effect
  // (deps below) is forced to re-run and re-arm a fresh interval. Without
  // this, a failed submit leaves `phase` unchanged, no other dep changes, and
  // the clock freezes for the rest of the board.
  const [timerResetKey, setTimerResetKey] = useState(0)

  const boardStartRef = useRef(0)
  const commitGuardRef = useRef(false) // guards against a double board-submit, same pattern as app/quiz/page.tsx
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // round_net_before for the NEXT board's submit call -- a per-round running
  // total, mirroring app/quiz/page.tsx's `round.net`. A ref because it must be
  // read synchronously inside submitBoard, not one render behind a setState.
  const roundNetRef = useRef(0)

  const isTime = config?.lever === 'time'

  // ---- Board fetch -------------------------------------------------------
  // Takes `cfg` explicitly rather than reading the `config` from context: the
  // very first call happens in the same tick as setConfig(cfg) below, before
  // that state update has propagated to a re-render, so closing over the
  // context value here would read a stale (often null) config.
  // `round` is likewise passed explicitly rather than read from the `roundNo`
  // state -- beginRound computes the round number locally before that state
  // update has committed either, so reading state here could serve the wrong
  // round's exclusion set (FIX 1c).
  async function fetchBoard(cfg: GameConfig, state: LeverState, round: number) {
    setPhase('loading')
    setBoardError(null)
    // FIX 4: match is board-grained, not item-grained -- pass the 'board'
    // timing profile through the single lever chokepoint so the clock is
    // sized for six placements, not one MCQ.
    const { difficulty, timeLimit } = resolveLever(cfg, state, 'board')
    try {
      const params = new URLSearchParams({ difficulty: String(difficulty), session_id: sessionId, round: String(round) })
      const res = await fetch(`/api/match/board?${params.toString()}`)
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        setBoardError(
          data?.error === 'not enough term items'
            ? 'Not enough term items are ready for a board yet -- try again soon.'
            : 'Could not load a board. Please try again.'
        )
        // FIX 2: this round (`round`) started with a round_start already logged
        // (beginRound) but can never reach a board now -- it must still consume
        // its round number, or Start Round reuses it (session.roundsPlayed never
        // advanced). abandonRound (lib/game/game-context.tsx) is the shared call
        // for exactly this: a board fetch failure ends a started round without
        // completing it, same category as the quiz's abandoned-round fix (1 Aug
        // 2026) and match's own reintroduction of it (package A1).
        abandonRound(round, { game_type: MATCH_GAME_ID, mode: cfg.mode, lever: cfg.lever })
        setPhase('setup')
        return
      }
      const clues: ClueItem[] = data.clues
      const terms: string[] = data.terms
      const boardToken: string = data.boardToken
      setBoard({ clues, terms, boardToken })
      // Only ever true once the route actually exposes selectBoard's
      // difficultyHonored decision -- absent or non-boolean defaults to
      // false and the Level badge stays hidden, never a client-side guess.
      setDifficultyHonored(parseDifficultyHonored(data.difficultyHonored))
      // FIX 10: assign each tile a stable id at fetch time, independent of
      // its term text, so duplicate term strings never collide on removal or
      // on the React `key` below.
      setBank(terms.map((term, i) => ({ id: `tile-${i}`, term })))
      setPlacements(Object.fromEntries(clues.map((c) => [c.itemId, null])))
      setSelected(null)
      setTimeLeft(timeLimit)
      boardStartRef.current = Date.now()
      setPhase('playing')
    } catch (err) {
      console.error('match: board fetch failed', err)
      setBoardError('Could not load a board. Please try again.')
      // FIX 2: same round-number consumption as the non-ok branch above.
      abandonRound(round, { game_type: MATCH_GAME_ID, mode: cfg.mode, lever: cfg.lever })
      setPhase('setup')
    }
  }

  // ---- Round lifecycle -----------------------------------------------------

  function beginRound(cfg: GameConfig) {
    const startState = initialLeverState(cfg)
    const nextRoundNo = session.roundsPlayed + 1
    setRoundNo(nextRoundNo)
    setRoundTotals(EMPTY_TOTALS)
    roundNetRef.current = 0
    setScored(null)
    setLeverState(startState)
    emit({
      event_type: 'round_start', game_type: MATCH_GAME_ID, mode: cfg.mode, lever: cfg.lever,
      round: nextRoundNo, difficulty_level: resolveLever(cfg, startState, 'board').difficulty,
    })
    void fetchBoard(cfg, startState, nextRoundNo)
  }

  function startRound() {
    const cfg: GameConfig = { mode: modeChoice, lever: leverChoice, fixedDifficulty: FIXED_DIFFICULTY }
    setConfig(cfg)
    beginRound(cfg)
  }

  function keepGoing() {
    if (!config) return
    registerContinue()
    beginRound(config)
  }

  function stopRound() {
    if (!config) return
    emit({ event_type: 'round_stop', game_type: MATCH_GAME_ID, mode: config.mode, lever: config.lever, round: roundNo })
    router.push('/')
  }

  // Header "Exit" -- only abandons a round if one was actually under way
  // (roundNo > 0); leaving the setup screen before Start has nothing to stop.
  function exitMidRound() {
    if (config && roundNo > 0) {
      abandonRound(roundNo, { game_type: MATCH_GAME_ID, mode: config.mode, lever: config.lever })
    }
    router.push('/')
  }

  function finishRound() {
    if (!config) return
    const summary: RoundSummary = {
      net: roundTotals.net,
      potential: roundTotals.potential,
      correct: roundTotals.correctPairs,
      wrong: roundTotals.totalPairs - roundTotals.correctPairs,
      answered: roundTotals.totalPairs,
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
  // mirrors app/results/page.tsx's effect. announceRoundOffer's own ref guard
  // (lib/game/game-context.tsx) makes this fire once per round even though
  // this effect is allowed to re-run.
  useEffect(() => {
    if (phase !== 'roundResult' || !config) return
    announceRoundOffer(roundNo, { game_type: MATCH_GAME_ID, mode: config.mode, lever: config.lever })
  }, [phase, roundNo, config, announceRoundOffer])

  // ---- Board submit --------------------------------------------------------

  // `trigger` (FIX 1) distinguishes WHY this submit fired, not just whether it
  // failed: 'timeout' means the countdown reached zero and force-submitted;
  // 'manual' means the student clicked Submit (or hit Retry on the FIX 1
  // terminal screen) while the clock was still running or timing isn't in
  // play at all. This is read off the CALL SITE, never off `timeLeft` state --
  // by the time a failed fetch's `await` resolves, timeLeft may already have
  // been re-rendered to something else, so the trigger has to travel with the
  // call, not be re-derived afterwards.
  async function submitBoard(cfg: GameConfig, state: LeverState, trigger: 'manual' | 'timeout' = 'manual') {
    if (!board || commitGuardRef.current) return
    commitGuardRef.current = true
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setSubmitting(true)
    const elapsed = Date.now() - boardStartRef.current
    // FIX 4: same 'board' profile as fetchBoard -- this must resolve to the
    // exact timeLimit the board was actually served with, so time_limit below
    // reflects reality rather than a per-item number.
    const { difficulty, timeLimit } = resolveLever(cfg, state, 'board')
    try {
      const res = await fetch('/api/match/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // FIX 1: board_token is the server-signed claim from THIS board's
        // fetch -- submit rejects anything that doesn't match it.
        body: JSON.stringify({
          session_id: sessionId,
          client_student_id: studentId ?? undefined,
          board_token: board.boardToken,
          round: roundNo,
          // FIX 5: the ordinal of the board this call completes (1-indexed),
          // not the count before it -- see the matching comment in submit/route.ts.
          boards_completed: roundTotals.boardsPlayed + 1,
          submission: placements,
          mode: cfg.mode,
          lever: cfg.lever,
          difficulty_level: difficulty,
          time_limit: timeLimit,
          round_net_before: roundNetRef.current,
          time_taken_ms: elapsed,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        console.error('match: /api/match/submit failed', data)
        if (trigger === 'timeout') {
          // FIX 1: the clock was already at zero when this submit fired --
          // re-arming (FIX 9, below) would let the countdown effect's
          // `prev <= 1` branch call this exact same failing submit again on
          // the very next tick, forever (1 Hz POST loop, board frozen at 0s,
          // nothing shown to the student). Terminal state instead: stop,
          // explain, offer retry/exit.
          setPhase('timedOut')
        } else {
          // FIX 9: clock is still running (or isn't in play) -- re-arm so the
          // countdown effect gets a fresh interval instead of freezing.
          setTimerResetKey((k) => k + 1)
        }
        return
      }
      const result = data as ScoredBoard
      const succeeded = boardSucceeded(result.correctCount, result.total)
      roundNetRef.current += result.net
      setScored(result)
      setRoundTotals((t) => ({
        net: t.net + result.net,
        potential: t.potential + result.potential,
        accrual: t.accrual + result.accrual,
        bonus: t.bonus + result.bonus,
        floor: t.floor + result.floor,
        correctPairs: t.correctPairs + result.correctCount,
        totalPairs: t.totalPairs + result.total,
        boardsPlayed: t.boardsPlayed + 1,
        boardsSucceeded: t.boardsSucceeded + (succeeded ? 1 : 0),
        peakDifficulty: Math.max(t.peakDifficulty, difficulty),
        bestTimeMs: succeeded && cfg.lever === 'time'
          ? (t.bestTimeMs == null ? elapsed : Math.min(t.bestTimeMs, elapsed))
          : t.bestTimeMs,
      }))
      // The lever fires BETWEEN boards, not between pairs -- one call here,
      // never inside the per-pair reveal below.
      setLeverState((prev) => advanceLeverState(cfg, prev, succeeded))
      setRevealIndex(0)
      setCombo(0)
      setPhase('revealing')
    } catch (err) {
      console.error('match: /api/match/submit request failed', err)
      // FIX 1 / FIX 9: same trigger-based split as the non-ok branch above.
      if (trigger === 'timeout') setPhase('timedOut')
      else setTimerResetKey((k) => k + 1)
    } finally {
      commitGuardRef.current = false
      setSubmitting(false)
    }
  }

  function handleSubmit() {
    if (!config || phase !== 'playing' || submitting) return
    void submitBoard(config, leverState)
  }

  // FIX 1: explicit retry from the terminal timed-out-submit screen. Reuses
  // the same board/placements/board_token still held in state -- no new board
  // fetch, per the note that another agent is making board_token single-live
  // (issuing a new board invalidates the old one), so this must not try to
  // hold or request a second one. `submitting` (bound to the button's
  // `disabled`) already stops a double-click; a retry that fails again is
  // trigger:'manual', so it re-sets `timerResetKey` (a no-op while phase is
  // 'timedOut', not 'playing') and simply leaves this screen showing.
  function retryTimedOutSubmit() {
    if (!config) return
    void submitBoard(config, leverState)
  }

  // FIX 3: "latest ref" pattern -- kept pointed at the newest `submitBoard`
  // closure after EVERY render (no dependency array), so the countdown
  // interval below (which cannot re-run on every render the way a normal
  // effect can) always calls into the current `placements`. Before this fix
  // the interval below closed over whatever `submitBoard` existed when the
  // effect LAST ran (deps [phase, config, leverState]), which for a
  // time-lever board is the render right after fetchBoard -- i.e. `placements`
  // still all-null. A student who filled all six slots and then ran out of
  // clock had an empty board force-submitted: scored 0/6, charged the floor
  // penalty, and six question_answered rows written wrong.
  const submitBoardRef = useRef(submitBoard)
  useEffect(() => {
    submitBoardRef.current = submitBoard
  })

  // Timer (time-pressure lever only) -- a whole-board countdown, not
  // per-pair. Timeout force-submits whatever is currently placed (read via
  // submitBoardRef, always current -- see FIX 3 above).
  // `timerResetKey` (FIX 9) forces this effect to re-run and re-arm a fresh
  // interval after a failed submit -- without it, `phase` stays 'playing',
  // no other dep changes, and the clock is frozen for the rest of the board.
  useEffect(() => {
    if (phase !== 'playing' || !config || config.lever !== 'time') return
    const iv = setInterval(() => {
      if (commitGuardRef.current) return
      setTimeLeft((prev) => {
        // FIX 1: explicitly tagged 'timeout' -- this is the ONLY call site that
        // means "the clock hit zero", so it's the only one submitBoard is
        // allowed to treat a failure from as terminal (see the trigger comment
        // on submitBoard above).
        if (prev <= 1) { void submitBoardRef.current(config, leverState, 'timeout'); return 0 }
        return prev - 1
      })
    }, 1000)
    timerRef.current = iv
    return () => { clearInterval(iv); if (timerRef.current === iv) timerRef.current = null }
  }, [phase, config, leverState, timerResetKey])

  // Reveal pairs one at a time with a running combo counter before showing
  // the board total -- the thrill is deliberately in the reveal.
  useEffect(() => {
    if (phase !== 'revealing' || !scored) return
    if (revealIndex >= scored.pairs.length) {
      const t = setTimeout(() => setPhase('boardResult'), 400)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => {
      const pair = scored.pairs[revealIndex]
      setCombo((c) => (pair.correct ? c + 1 : 0))
      setRevealIndex((i) => i + 1)
    }, 650)
    return () => clearTimeout(t)
  }, [phase, scored, revealIndex])

  function nextBoard() {
    if (!config) return
    if (roundTotals.boardsPlayed >= BOARDS_PER_ROUND) {
      finishRound()
    } else {
      void fetchBoard(config, leverState, roundNo)
    }
  }

  // ---- Placement (click-to-select, click-to-place; swaps, never duplicates) --

  function clickBankTile(tile: BankTile) {
    if (phase !== 'playing') return
    if (selected?.source === 'bank' && selected.id === tile.id) { setSelected(null); return }
    setSelected({ source: 'bank', id: tile.id, term: tile.term })
  }

  function clickSlot(itemId: string) {
    if (phase !== 'playing') return
    if (!selected) {
      const current = placements[itemId]
      if (current) setSelected({ source: 'slot', itemId, term: current })
      return
    }
    if (selected.source === 'slot' && selected.itemId === itemId) { setSelected(null); return }
    const incoming = selected.term
    const displaced = placements[itemId] ?? null
    setPlacements((p) => {
      const next = { ...p, [itemId]: incoming }
      if (selected.source === 'slot') next[selected.itemId] = displaced
      return next
    })
    if (selected.source === 'bank') {
      // FIX 10: remove the exact tile that was placed, by id -- filtering by
      // `.term !== incoming` would remove EVERY tile sharing that text, which
      // is a real (not just cosmetic) bug once two content_items rows share a
      // term string. The freed id is reused for the displaced tile coming
      // back, if any, so bank ids stay unique without minting a new one.
      const bankId = selected.id
      setBank((b) => {
        const next = b.filter((t) => t.id !== bankId)
        return displaced != null ? [...next, { id: bankId, term: displaced }] : next
      })
    }
    setSelected(null)
  }

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
              <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-4 shadow-lg shadow-violet-500/20">
                <Link2 className="w-8 h-8 text-white" />
              </div>
            </div>
            <h1 className="text-4xl font-black text-white mb-2">Match the Following</h1>
            <p className="text-slate-400">Pair each clue with its term. Choose your challenge lever, then start.</p>
          </div>

          {boardError && (
            <div className="mb-8 rounded-xl bg-red-600/20 border border-red-500/40 p-4 text-center text-red-200 text-sm font-semibold">
              {boardError}
            </div>
          )}

          {/* FIX 6: mode was hardcoded to 'normal' -- the quiz lets a student
              pick rapid vs normal via which dashboard tile they click; match
              has one tile, so it picks here instead. */}
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
            <p className="text-slate-400 text-sm mb-6">The lever moves between boards, not between pairs.</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setLeverChoice('adaptive')}
                className={`relative rounded-2xl p-1 transition-all duration-300 ${leverChoice === 'adaptive' ? 'ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/20' : 'border border-slate-700/50'}`}
              >
                <div className={`rounded-xl px-6 py-5 transition-all duration-300 ${leverChoice === 'adaptive' ? 'bg-gradient-to-br from-emerald-600/20 to-emerald-700/10' : 'bg-slate-800/50 hover:bg-slate-800/70'}`}>
                  <Brain className={`w-8 h-8 mb-3 ${leverChoice === 'adaptive' ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <h3 className={`font-black text-sm ${leverChoice === 'adaptive' ? 'text-emerald-300' : 'text-slate-300'}`}>Adaptive Difficulty</h3>
                  <p className={`text-xs mt-2 ${leverChoice === 'adaptive' ? 'text-emerald-200/70' : 'text-slate-500'}`}>Boards get harder as you win, easier when you slip</p>
                </div>
              </button>
              <button
                onClick={() => setLeverChoice('time')}
                className={`relative rounded-2xl p-1 transition-all duration-300 ${leverChoice === 'time' ? 'ring-2 ring-orange-400 shadow-lg shadow-orange-500/20' : 'border border-slate-700/50'}`}
              >
                <div className={`rounded-xl px-6 py-5 transition-all duration-300 ${leverChoice === 'time' ? 'bg-gradient-to-br from-orange-600/20 to-orange-700/10' : 'bg-slate-800/50 hover:bg-slate-800/70'}`}>
                  <Clock className={`w-8 h-8 mb-3 ${leverChoice === 'time' ? 'text-orange-400' : 'text-slate-500'}`} />
                  <h3 className={`font-black text-sm ${leverChoice === 'time' ? 'text-orange-300' : 'text-slate-300'}`}>Time Pressure</h3>
                  <p className={`text-xs mt-2 ${leverChoice === 'time' ? 'text-orange-200/70' : 'text-slate-500'}`}>The board clock tightens as you improve</p>
                </div>
              </button>
            </div>
          </div>

          <div className="mb-10 rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
            <h2 className="text-white font-black text-lg mb-4">How Points Work</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-emerald-400 rounded-full" /></div>
                <p className="text-slate-300 text-sm font-semibold">Each correct pair: <span className="text-emerald-300">+{MATCH_POINTS.perPair}</span></p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-sky-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-sky-400 rounded-full" /></div>
                <p className="text-slate-300 text-sm font-semibold">Clean board bonus: <span className="text-sky-300">+{MATCH_POINTS.perfectBonus}</span></p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-red-400 rounded-full" /></div>
                <p className="text-slate-300 text-sm font-semibold">{MATCH_POINTS.floorAtOrBelow} correct or fewer: <span className="text-red-300">{MATCH_POINTS.floorPenalty}</span></p>
              </div>
            </div>
          </div>

          <button
            onClick={startRound}
            className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-600 p-1 shadow-xl hover:shadow-2xl transition-all duration-300"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-violet-400 to-fuchsia-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative bg-gradient-to-r from-violet-500 to-fuchsia-600 rounded-xl px-8 py-4">
              <p className="font-black text-white text-center text-lg">Start Round</p>
            </div>
          </button>
        </div>
      </main>
    )
  }

  if (phase === 'loading' || !config || !board) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 grid place-items-center">
        <p className="text-slate-500">Preparing board…</p>
      </main>
    )
  }

  if (phase === 'roundResult') {
    const netDisplay = roundTotals.net
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-fuchsia-500/30 blur-2xl rounded-full w-32 h-32 mx-auto animate-pulse" />
              <Trophy className="w-20 h-20 text-fuchsia-400 relative z-10" />
            </div>
          </div>
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black text-white mb-2">Round Complete!</h1>
            <p className="text-slate-400 text-lg">{roundTotals.boardsSucceeded}/{roundTotals.boardsPlayed} boards won</p>
          </div>

          <div className="relative rounded-2xl bg-gradient-to-br from-fuchsia-500/20 via-violet-600/10 to-violet-700/5 border border-fuchsia-500/40 p-8 shadow-xl mb-8">
            <div className="relative text-center">
              <p className="text-fuchsia-300/80 text-sm font-semibold uppercase tracking-wider mb-3">Net Points This Round</p>
              <p className={`text-7xl font-black mb-2 ${netDisplay < 0 ? 'text-red-300' : 'text-fuchsia-300'}`}>{netDisplay}</p>
              <p className="text-fuchsia-400/60 text-sm">{roundTotals.correctPairs}/{roundTotals.totalPairs} pairs correct</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Score Breakdown</h2>
            <div className="space-y-2">
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 flex items-center justify-between">
                <span className="text-slate-300 font-medium">Accrual <span className="text-slate-500 text-xs">({roundTotals.correctPairs} pairs × +{MATCH_POINTS.perPair})</span></span>
                <span className="text-emerald-300 font-black text-xl">+{roundTotals.accrual}</span>
              </div>
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 flex items-center justify-between">
                <span className="text-slate-300 font-medium">Clean-board bonus</span>
                <span className="text-sky-300 font-black text-xl">+{roundTotals.bonus}</span>
              </div>
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 flex items-center justify-between">
                <span className="text-slate-300 font-medium">Floor penalty</span>
                <span className="text-red-300 font-black text-xl">{roundTotals.floor}</span>
              </div>
              <div className="rounded-lg bg-slate-800/70 border border-fuchsia-500/30 p-4 flex items-center justify-between">
                <span className="text-white font-black">Net this round</span>
                <span className={`font-black text-xl ${netDisplay < 0 ? 'text-red-300' : 'text-fuchsia-300'}`}>{netDisplay}</span>
              </div>
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

  // FIX 1: terminal state for a submit that failed because the clock hit
  // zero -- see the trigger comment on submitBoard. Aurora-glass amber/red
  // treatment (not a bare error box) so it matches the rest of the page;
  // offers the two explicit ways out the spec called for: retry the same
  // submission, or exit (which counts this round as stopped, same as Exit
  // mid-round elsewhere on this page).
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
              The clock hit zero, but the board couldn&apos;t be recorded (a connection hiccup, most likely).
              Your placements are still here -- retry the submission, or exit and this round ends here.
            </p>
          </div>
          <div className="mb-8 rounded-2xl bg-red-600/10 border border-red-500/30 p-6">
            <p className="text-red-200/80 text-sm text-center">Nothing else on the board has changed. Retrying sends the exact same submission again.</p>
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

  const boardsLabel = `Board ${Math.min(roundTotals.boardsPlayed + 1, BOARDS_PER_ROUND)} of ${BOARDS_PER_ROUND}`

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={exitMidRound} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-semibold">Exit</span>
          </button>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-slate-400 text-xs uppercase font-semibold">Round Net</p>
              <p className={`text-2xl font-black ${roundTotals.net < 0 ? 'text-red-300' : 'text-fuchsia-300'}`}>{roundTotals.net}</p>
            </div>
            {isTime ? (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${timeLeft <= 10 && phase === 'playing' ? 'bg-red-500/20 border border-red-500/40' : 'bg-slate-800/50 border border-slate-700/50'}`}>
                <Clock className={`w-4 h-4 ${timeLeft <= 10 && phase === 'playing' ? 'text-red-400 animate-pulse' : 'text-slate-400'}`} />
                <p className={`font-black text-sm ${timeLeft <= 10 && phase === 'playing' ? 'text-red-300' : 'text-slate-200'}`}>{timeLeft}s</p>
              </div>
            ) : difficultyHonored ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <Brain className="w-4 h-4 text-emerald-400" />
                <p className="font-black text-sm text-emerald-300">Level {leverState.difficulty}</p>
              </div>
            ) : null}
          </div>
        </div>

        <p className="text-slate-400 text-xs uppercase font-semibold mb-6">{boardsLabel}</p>

        {(phase === 'playing' || phase === 'revealing' || phase === 'boardResult') && (
          <div className="mb-8 space-y-3">
            {board.clues.map((c, i) => {
              const placedTerm = placements[c.itemId]
              const isSelectedSlot = selected?.source === 'slot' && selected.itemId === c.itemId
              const revealed = phase !== 'playing' && (phase === 'boardResult' || i < revealIndex)
              const pairResult = scored?.pairs.find((p) => p.itemId === c.itemId) ?? null

              let slotCls = 'bg-slate-800/50 border-slate-700/50'
              if (isSelectedSlot) slotCls = 'bg-violet-600/20 border-violet-400/60 ring-2 ring-violet-400/40'
              else if (revealed && pairResult) {
                slotCls = pairResult.correct ? 'bg-emerald-600/20 border-emerald-500/40' : 'bg-red-600/20 border-red-500/40'
              }

              return (
                <div key={c.itemId} className={`rounded-xl border p-4 transition-all duration-300 ${slotCls}`}>
                  <p className="text-slate-300 text-sm mb-3">{c.clue}</p>
                  <button
                    onClick={() => clickSlot(c.itemId)}
                    disabled={phase !== 'playing'}
                    className={`w-full rounded-lg border border-dashed p-3 text-left font-semibold transition-colors ${
                      placedTerm ? 'border-transparent bg-slate-900/50 text-white' : 'border-slate-600/60 text-slate-500'
                    } ${phase === 'playing' ? 'cursor-pointer hover:border-violet-400/60' : 'cursor-default'}`}
                  >
                    {placedTerm ?? 'Tap a term below…'}
                  </button>
                  {revealed && pairResult && (
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-slate-400">Correct: {pairResult.term}</span>
                      {pairResult.correct
                        ? <Check className="w-5 h-5 text-emerald-400" />
                        : <X className="w-5 h-5 text-red-400" />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {phase === 'playing' && (
          <>
            <div className="mb-8">
              <p className="text-slate-400 text-xs uppercase font-semibold mb-3">Terms</p>
              <div className="flex flex-wrap gap-3">
                {bank.map((tile) => {
                  const isSelected = selected?.source === 'bank' && selected.id === tile.id
                  return (
                    <button
                      key={tile.id}
                      onClick={() => clickBankTile(tile)}
                      className={`rounded-xl border px-4 py-3 font-semibold text-sm transition-all duration-200 ${
                        isSelected
                          ? 'bg-violet-600/30 border-violet-400/70 text-violet-100 ring-2 ring-violet-400/40 scale-105'
                          : 'bg-slate-800/50 border-slate-700/50 text-slate-200 hover:border-violet-400/40'
                      }`}
                    >
                      {tile.term}
                    </button>
                  )
                })}
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full group relative overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 p-1 shadow-lg hover:shadow-2xl transition-all duration-300 disabled:opacity-60"
            >
              <div className="relative bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-lg px-6 py-3">
                <p className="font-black text-white text-center">{submitting ? 'Scoring…' : 'Submit Board'}</p>
              </div>
            </button>
          </>
        )}

        {phase === 'revealing' && combo > 1 && (
          <div className="flex items-center justify-center gap-2 mb-4">
            <Flame className="w-5 h-5 text-orange-400 animate-pulse" />
            <p className="font-black text-orange-300">Combo ×{combo}</p>
          </div>
        )}

        {phase === 'boardResult' && scored && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-fuchsia-400" />
                <p className="font-black text-white">Board Total</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Accrual ({scored.correctCount}/{scored.total} × +{MATCH_POINTS.perPair})</span>
                  <span className="text-emerald-300 font-bold">+{scored.accrual}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Clean-board bonus</span>
                  <span className="text-sky-300 font-bold">+{scored.bonus}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">Floor penalty</span>
                  <span className="text-red-300 font-bold">{scored.floor}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-700/50 pt-2 mt-2">
                  <span className="text-white font-black">Net</span>
                  <span className={`font-black text-xl ${scored.net < 0 ? 'text-red-300' : 'text-fuchsia-300'}`}>{scored.net}</span>
                </div>
              </div>
            </div>
            <button
              onClick={nextBoard}
              className="w-full group relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 p-1 shadow-lg hover:shadow-2xl transition-all duration-300"
            >
              <div className="relative bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg px-6 py-3">
                <p className="font-black text-white text-center">
                  {roundTotals.boardsPlayed >= BOARDS_PER_ROUND ? 'See Round Results' : 'Next Board'}
                </p>
              </div>
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
