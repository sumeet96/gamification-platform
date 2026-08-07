'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Trophy, Zap, ArrowRight, Sparkles, Grid3x3, Shuffle, RotateCcw, AlertTriangle, Flag,
} from 'lucide-react'
import { useGame } from '@/lib/game/game-context'
import { FIXED_DIFFICULTY, type GameConfig, type RoundSummary } from '@/lib/game/engine'
import { getGame, type PartitionBoardPoints } from '@/lib/games/registry'

// Package A5: Connections. Mirrors app/games/match/page.tsx's phase structure
// (setup -> loading -> playing -> boardResult -> roundResult) and its
// abandonRound/announceRoundOffer/round_offer wiring. This game is
// lever: 'none' (confirmed by the user 6 Aug 2026, docs/
// NEXT_SESSION_BUILD_BRIEF.md §6) -- there is NO lever-choice screen and NO
// clock, and this file must never branch game LOGIC on config.lever or read
// BOARD_TIME_BASE. tests/connections.test.ts's source-scan guard enforces
// the equivalent rule on lib/games/connections.ts and lib/games/registry.ts.
//
// FIXED 7 Aug 2026 (round-collision defect): 'none' is now a first-class
// member of lib/game/engine.ts's `Lever` AND `Mode` types --
// resolveLever/advanceLeverState treat it as fully inert (tests/lever.test.ts)
// -- so this file now uses useGame()'s `setConfig`/`recordRound`/
// `registerContinue` exactly like every other game instead of keeping a
// private round counter. The old counter was seeded from but never written
// back into `session.roundsPlayed`, so a Connections round number could
// collide with another game's round number in the same session and
// spuriously suppress that round's `round_offer` (see this fix's report).
// `session.roundsPlayed` is now the single source of truth for round
// numbering, same as every other game.
//
// `CONNECTIONS_CONFIG` below is a constant, not a per-session choice (no
// lever/mode picker screen), so it's read directly rather than threaded
// through function params the way match threads its user-chosen `cfg` --
// match's fetchBoard comment explains a first-render stale-closure race that
// threading avoids; that race doesn't exist here because this value never
// changes across a render.

const CONNECTIONS_GAME_ID = 'connections'
const CONNECTIONS_POINTS = getGame(CONNECTIONS_GAME_ID).points as PartitionBoardPoints
const CONNECTIONS_CONFIG: GameConfig = { mode: 'none', lever: 'none', fixedDifficulty: FIXED_DIFFICULTY, ownerGameId: CONNECTIONS_GAME_ID }

// UNCONFIRMED, same flag as match's BOARDS_PER_ROUND: how many boards make one
// "round" for Connections is not specified anywhere in the spec. Three, for
// the same reason match picked three -- long enough to feel like a session,
// short enough to reasonably ask "keep going?" without a rapid/normal split
// the registry doesn't have (connections has exactly one GAME_REGISTRY entry).
const BOARDS_PER_ROUND = 3

interface Tile { contentItemId: string; text: string }
// boardId (FIX 6, A5 review): the plain board id the board route now also
// returns -- not secret (unlike the shuffle seed, which never leaves the
// server), needed so board_reported_ambiguous can be joined back to a board.
interface BoardData { tiles: Tile[]; boardToken: string; boardId: string }
interface SolvedGroup { groupId: string; groupOrdinal: number; label: string; tileIds: string[] }

interface GuessResponse {
  ok: boolean
  correct?: boolean
  groupId?: string | null
  groupOrdinal?: number | null
  groupLabel?: string | null
  oneAway?: boolean
  forced?: boolean
  mistakesAfter?: number
  pointsDelta?: number
  duplicate?: boolean
  reason?: string
}

interface CompleteResponse {
  ok: boolean
  groupsSolved?: number
  mistakes?: number
  accrual?: number
  mistakeCost?: number
  bonus?: number
  floor?: number
  net?: number
  potential?: number
  perfect?: boolean
  duplicate?: boolean
}

type Phase = 'setup' | 'loading' | 'playing' | 'boardResult' | 'roundResult'

// Fixed accent per group ORDINAL (0..3), not per solve order -- gives the
// board a stable, recognisable "four categories" identity the moment a group
// is revealed, same spirit as the genre's usual colour-coded categories.
const GROUP_ACCENTS = [
  { ring: 'ring-amber-400/60', bg: 'from-amber-500/20 to-amber-600/10', border: 'border-amber-500/40', text: 'text-amber-200' },
  { ring: 'ring-emerald-400/60', bg: 'from-emerald-500/20 to-emerald-600/10', border: 'border-emerald-500/40', text: 'text-emerald-200' },
  { ring: 'ring-sky-400/60', bg: 'from-sky-500/20 to-sky-600/10', border: 'border-sky-500/40', text: 'text-sky-200' },
  { ring: 'ring-violet-400/60', bg: 'from-violet-500/20 to-violet-600/10', border: 'border-violet-500/40', text: 'text-violet-200' },
]

interface RoundTotals {
  net: number; potential: number; accrual: number; bonus: number; floor: number; mistakeCost: number
  groupsSolved: number; boardsPlayed: number; boardsSolved: number
  mistakes: number // cumulative wrong guesses across the round -- feeds RoundSummary.wrong (finishRound)
}
const EMPTY_TOTALS: RoundTotals = {
  net: 0, potential: 0, accrual: 0, bonus: 0, floor: 0, mistakeCost: 0,
  groupsSolved: 0, boardsPlayed: 0, boardsSolved: 0, mistakes: 0,
}

export default function ConnectionsGame() {
  const router = useRouter()
  const {
    session, sessionId, studentId, setConfig, recordRound, registerContinue, announceRoundOffer, abandonRound, emit,
  } = useGame()

  const [phase, setPhase] = useState<Phase>('setup')
  const [board, setBoard] = useState<BoardData | null>(null)
  const [tileOrder, setTileOrder] = useState<string[]>([])
  const [selectedTileIds, setSelectedTileIds] = useState<string[]>([])
  const [solvedGroups, setSolvedGroups] = useState<SolvedGroup[]>([])
  const [mistakes, setMistakes] = useState(0)
  const [oneAwayFlash, setOneAwayFlash] = useState(false)
  const [deselectCount, setDeselectCount] = useState(0)
  const [shuffleCount, setShuffleCount] = useState(0)
  const [ambiguousReported, setAmbiguousReported] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [guessError, setGuessError] = useState<string | null>(null)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [lastScored, setLastScored] = useState<CompleteResponse | null>(null)
  const [roundTotals, setRoundTotals] = useState<RoundTotals>(EMPTY_TOTALS)
  const [roundNo, setRoundNo] = useState(0)
  const [boardError, setBoardError] = useState<string | null>(null)

  const boardStartRef = useRef(0)
  const guessGuardRef = useRef(false) // guards a double guess-submit
  const completeGuardRef = useRef(false) // guards a double/duplicate board-complete submit
  const roundNetRef = useRef(0)
  const tilesByIdRef = useRef<Map<string, Tile>>(new Map())

  // ---- Board fetch -----------------------------------------------------

  async function fetchBoard(round: number) {
    setPhase('loading')
    setBoardError(null)
    try {
      const params = new URLSearchParams({ session_id: sessionId })
      const res = await fetch(`/api/connections/board?${params.toString()}`)
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        setBoardError(
          data?.error === 'not enough boards'
            ? 'No Connections boards are ready yet -- try again soon.'
            : 'Could not load a board. Please try again.'
        )
        abandonRound(round, { game_type: CONNECTIONS_GAME_ID, mode: CONNECTIONS_CONFIG.mode, lever: CONNECTIONS_CONFIG.lever })
        setPhase('setup')
        return
      }
      const tiles: Tile[] = data.tiles
      tilesByIdRef.current = new Map(tiles.map((t) => [t.contentItemId, t]))
      setBoard({ tiles, boardToken: data.boardToken, boardId: data.boardId })
      setTileOrder(tiles.map((t) => t.contentItemId))
      setSolvedGroups([])
      setMistakes(0)
      setSelectedTileIds([])
      setDeselectCount(0)
      setShuffleCount(0)
      setAmbiguousReported(false)
      setGuessError(null)
      setCompleteError(null)
      setLastScored(null)
      boardStartRef.current = Date.now()
      setPhase('playing')
    } catch (err) {
      console.error('connections: board fetch failed', err)
      setBoardError('Could not load a board. Please try again.')
      abandonRound(round, { game_type: CONNECTIONS_GAME_ID, mode: CONNECTIONS_CONFIG.mode, lever: CONNECTIONS_CONFIG.lever })
      setPhase('setup')
    }
  }

  // ---- Round lifecycle ---------------------------------------------------

  function beginRound() {
    // session.roundsPlayed is now the single source of truth for round
    // numbering (see this file's header) -- same computation match and word
    // use, no local fallback needed since recordRound (finishRound, below)
    // keeps it current.
    const nextRoundNo = session.roundsPlayed + 1
    setRoundNo(nextRoundNo)
    setRoundTotals(EMPTY_TOTALS)
    roundNetRef.current = 0
    emit({
      event_type: 'round_start', game_type: CONNECTIONS_GAME_ID,
      mode: CONNECTIONS_CONFIG.mode, lever: CONNECTIONS_CONFIG.lever, round: nextRoundNo,
    })
    void fetchBoard(nextRoundNo)
  }

  function startRound() {
    setConfig(CONNECTIONS_CONFIG)
    beginRound()
  }

  function keepGoing() {
    // registerContinue() reads `round: session.roundsPlayed` itself, which by
    // now is current (finishRound below calls recordRound before this screen
    // can render) -- no need for the local-counter workaround this used to need.
    registerContinue()
    beginRound()
  }

  function stopRound() {
    emit({
      event_type: 'round_stop', game_type: CONNECTIONS_GAME_ID,
      mode: CONNECTIONS_CONFIG.mode, lever: CONNECTIONS_CONFIG.lever, round: roundNo,
    })
    router.push('/')
  }

  // Header "Exit" -- only abandons a round/board if one was actually under
  // way. A board still 'playing' also gets a best-effort terminal_reason
  // 'abandoned' board_complete so its partial progress (groups solved so far,
  // mistakes made) isn't lost -- fire-and-forget (keepalive) since we're
  // navigating away regardless, same reasoning logEvent.ts's fetch uses.
  function exitMidRound() {
    if (phase === 'playing' && board) {
      void completeBoard('abandoned', { keepalive: true })
    }
    if (roundNo > 0) {
      abandonRound(roundNo, { game_type: CONNECTIONS_GAME_ID, mode: CONNECTIONS_CONFIG.mode, lever: CONNECTIONS_CONFIG.lever })
    }
    router.push('/')
  }

  function finishRound() {
    // recordRound is what makes session.roundsPlayed advance -- must run
    // before this round's results render, or the next beginRound()/
    // registerContinue() call reads a stale count and reuses this round's
    // number (the exact defect this fix closes).
    const summary: RoundSummary = {
      net: roundTotals.net,
      potential: roundTotals.potential,
      correct: roundTotals.groupsSolved,
      wrong: roundTotals.mistakes,
      answered: roundTotals.groupsSolved + roundTotals.mistakes,
      // No difficulty concept for this game (registry: no difficulty tiebreak
      // yet) -- pinned to the constant config carries, same placeholder
      // initialLeverState uses for the 'none' lever.
      peakDifficulty: CONNECTIONS_CONFIG.fixedDifficulty,
      bestTimeMs: null, // no time lever, nothing to race
      lever: CONNECTIONS_CONFIG.lever,
      mode: CONNECTIONS_CONFIG.mode,
      round: roundNo,
    }
    recordRound(summary)
    setPhase('roundResult')
  }

  useEffect(() => {
    if (phase !== 'roundResult') return
    announceRoundOffer(roundNo, { game_type: CONNECTIONS_GAME_ID, mode: CONNECTIONS_CONFIG.mode, lever: CONNECTIONS_CONFIG.lever })
  }, [phase, roundNo, announceRoundOffer])

  // ---- Guess submit -------------------------------------------------------

  async function submitGuess() {
    if (!board || selectedTileIds.length !== 4 || guessGuardRef.current) return
    guessGuardRef.current = true
    setSubmitting(true)
    setGuessError(null)
    const guessedIds = [...selectedTileIds]
    const elapsed = Date.now() - boardStartRef.current
    try {
      const res = await fetch('/api/connections/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'guess',
          session_id: sessionId,
          client_student_id: studentId ?? undefined,
          board_token: board.boardToken,
          round: roundNo,
          guessed_item_ids: guessedIds,
          time_taken_ms: elapsed,
        }),
      })
      const data = (await res.json()) as GuessResponse
      if (!res.ok || !data?.ok) {
        if (data?.duplicate) {
          // The server already scored this exact combination (a race or a
          // retried request) -- reconcile from the read-back rather than
          // treating it as a fresh failure.
          applyGuessResult(data, guessedIds)
        } else if (data?.reason) {
          // Malformed -- should not normally happen since the UI only ever
          // lets four distinct known tiles be selected, but handle it rather
          // than assume.
          setGuessError('That guess could not be submitted. Try again.')
          setSelectedTileIds([])
        } else {
          setGuessError('Could not submit that guess. Try again.')
        }
        return
      }
      applyGuessResult(data, guessedIds)
    } catch (err) {
      console.error('connections: guess submit failed', err)
      setGuessError('Could not submit that guess. Try again.')
    } finally {
      guessGuardRef.current = false
      setSubmitting(false)
    }
  }

  function applyGuessResult(data: GuessResponse, guessedIds: string[]) {
    if (data.correct) {
      setSolvedGroups((groups) => {
        if (groups.some((g) => g.groupId === data.groupId)) return groups // already recorded (duplicate reconciliation)
        return [
          ...groups,
          {
            groupId: data.groupId ?? '',
            groupOrdinal: data.groupOrdinal ?? groups.length,
            label: data.groupLabel ?? 'Solved',
            tileIds: guessedIds,
          },
        ]
      })
      setSelectedTileIds([])
    } else {
      if (typeof data.mistakesAfter === 'number') setMistakes(data.mistakesAfter)
      if (data.oneAway) {
        setOneAwayFlash(true)
        setTimeout(() => setOneAwayFlash(false), 1200)
      }
      setSelectedTileIds([])
    }
  }

  // ---- Board completion ---------------------------------------------------

  // FIX 7 (A5 adversarial review): applies a (possibly duplicate) complete
  // response to round state. Shared by the normal success path and the
  // conflict/duplicate path below, so a lost-response retry that comes back
  // as a 409 reconciles the SAME way a fresh success would -- see the route's
  // own FIX 7 comment (app/api/connections/submit/route.ts) for the read-back
  // this depends on.
  function applyCompleteResult(data: CompleteResponse) {
    roundNetRef.current += data.net ?? 0
    setRoundTotals((t) => ({
      net: t.net + (data.net ?? 0),
      potential: t.potential + (data.potential ?? 0),
      accrual: t.accrual + (data.accrual ?? 0),
      bonus: t.bonus + (data.bonus ?? 0),
      floor: t.floor + (data.floor ?? 0),
      mistakeCost: t.mistakeCost + (data.mistakeCost ?? 0),
      groupsSolved: t.groupsSolved + (data.groupsSolved ?? 0),
      boardsPlayed: t.boardsPlayed + 1,
      boardsSolved: t.boardsSolved + (data.perfect || data.groupsSolved === 4 ? 1 : 0),
      mistakes: t.mistakes + (data.mistakes ?? 0),
    }))
    setLastScored(data)
    setPhase('boardResult')
  }

  async function completeBoard(reason: 'solved' | 'budget' | 'abandoned', opts?: { keepalive?: boolean }) {
    if (!board || completeGuardRef.current) return
    completeGuardRef.current = true
    const elapsed = Date.now() - boardStartRef.current
    try {
      const res = await fetch('/api/connections/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        keepalive: opts?.keepalive ?? false,
        body: JSON.stringify({
          kind: 'complete',
          session_id: sessionId,
          client_student_id: studentId ?? undefined,
          board_token: board.boardToken,
          round: roundNo,
          boards_completed: roundTotals.boardsPlayed + 1,
          deselect_count: deselectCount,
          shuffle_count: shuffleCount,
          time_taken_ms: elapsed,
          terminal_reason: reason,
          round_net_before: roundNetRef.current,
        }),
      })
      if (reason === 'abandoned') return // fire-and-forget: navigating away regardless
      const data = (await res.json()) as CompleteResponse
      if (!res.ok || !data?.ok) {
        if (data?.duplicate) {
          // FIX 7: the first attempt's response was lost (network drop, tab
          // suspend) but the server already scored it -- reconcile from the
          // read-back instead of dead-ending here (previously: lastScored
          // stayed null, Next Board stayed disabled, only Exit escaped).
          applyCompleteResult(data)
          return
        }
        console.error('connections: /api/connections/submit complete failed', data)
        setCompleteError('Could not finalise this board -- your score may not be saved. Try again.')
        return
      }
      applyCompleteResult(data)
    } catch (err) {
      if (reason === 'abandoned') return
      console.error('connections: /api/connections/submit complete request failed', err)
      setCompleteError('Could not finalise this board -- your score may not be saved. Try again.')
    } finally {
      completeGuardRef.current = false
    }
  }

  function retryComplete(reason: 'solved' | 'budget') {
    completeGuardRef.current = false
    void completeBoard(reason)
  }

  // Auto-finish the board the instant it is objectively over -- all 4 groups
  // solved, or the mistake budget is exhausted. Guarded by completeGuardRef
  // (inside completeBoard) so this can't double-fire if both conditions
  // somehow become true in the same render.
  useEffect(() => {
    if (phase !== 'playing' || !board) return
    if (solvedGroups.length >= 4) void completeBoard('solved')
    else if (mistakes >= CONNECTIONS_POINTS.maxMistakes) void completeBoard('budget')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, board, solvedGroups.length, mistakes])

  function nextBoard() {
    if (roundTotals.boardsPlayed >= BOARDS_PER_ROUND) {
      finishRound()
    } else {
      void fetchBoard(roundNo)
    }
  }

  // ---- Tile interaction ----------------------------------------------------

  const solvedTileIds = new Set(solvedGroups.flatMap((g) => g.tileIds))

  function clickTile(tileId: string) {
    if (phase !== 'playing' || submitting || solvedTileIds.has(tileId)) return
    const isSelected = selectedTileIds.includes(tileId)
    if (isSelected) {
      setDeselectCount((c) => c + 1)
      setSelectedTileIds((sel) => sel.filter((id) => id !== tileId))
      return
    }
    if (selectedTileIds.length >= 4) return
    setSelectedTileIds((sel) => [...sel, tileId])
  }

  function deselectAll() {
    if (selectedTileIds.length === 0) return
    setDeselectCount((c) => c + 1)
    setSelectedTileIds([])
  }

  function shuffleTiles() {
    setShuffleCount((c) => c + 1)
    setTileOrder((order) => {
      const arr = [...order]
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
      }
      return arr
    })
  }

  function reportAmbiguous() {
    if (ambiguousReported || !board) return
    setAmbiguousReported(true)
    emit({
      event_type: 'board_reported_ambiguous', game_type: CONNECTIONS_GAME_ID,
      mode: CONNECTIONS_CONFIG.mode, lever: CONNECTIONS_CONFIG.lever, round: roundNo,
      board_id: board.boardId, // FIX 6: so this event can be joined back to a board at all
    })
  }

  // ---- Screens --------------------------------------------------------------

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
              <div className="rounded-2xl bg-gradient-to-br from-amber-500 via-emerald-500 to-violet-600 p-4 shadow-lg shadow-violet-500/20">
                <Grid3x3 className="w-8 h-8 text-white" />
              </div>
            </div>
            <h1 className="text-4xl font-black text-white mb-2">Connections</h1>
            <p className="text-slate-400">Find groups of four that share something in common. {CONNECTIONS_POINTS.maxMistakes} mistakes allowed.</p>
          </div>

          {boardError && (
            <div className="mb-8 rounded-xl bg-red-600/20 border border-red-500/40 p-4 text-center text-red-200 text-sm font-semibold">
              {boardError}
            </div>
          )}

          <div className="mb-10 rounded-2xl bg-slate-800/50 border border-slate-700/50 p-6">
            <h2 className="text-white font-black text-lg mb-4">How Points Work</h2>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-emerald-400 rounded-full" /></div>
                <p className="text-slate-300 text-sm font-semibold">Each group found: <span className="text-emerald-300">+{CONNECTIONS_POINTS.perGroup}</span></p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-sky-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-sky-400 rounded-full" /></div>
                <p className="text-slate-300 text-sm font-semibold">Zero mistakes: <span className="text-sky-300">+{CONNECTIONS_POINTS.perfectBonus}</span></p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-red-400 rounded-full" /></div>
                <p className="text-slate-300 text-sm font-semibold">Each wrong guess: <span className="text-red-300">{CONNECTIONS_POINTS.mistakePenalty}</span></p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-red-400 rounded-full" /></div>
                <p className="text-slate-300 text-sm font-semibold">{CONNECTIONS_POINTS.floorAtOrBelow} or fewer solved when the budget runs out: <span className="text-red-300">{CONNECTIONS_POINTS.floorPenalty}</span></p>
              </div>
            </div>
          </div>

          <button
            onClick={startRound}
            className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-500 via-emerald-500 to-violet-600 p-1 shadow-xl hover:shadow-2xl transition-all duration-300"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-amber-400 via-emerald-400 to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative bg-gradient-to-r from-amber-500 via-emerald-500 to-violet-600 rounded-xl px-8 py-4">
              <p className="font-black text-white text-center text-lg">Start Round</p>
            </div>
          </button>
        </div>
      </main>
    )
  }

  if (phase === 'loading' || !board) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 grid place-items-center">
        <p className="text-slate-500">Preparing board…</p>
      </main>
    )
  }

  if (phase === 'roundResult') {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-violet-500/30 blur-2xl rounded-full w-32 h-32 mx-auto animate-pulse" />
              <Trophy className="w-20 h-20 text-violet-400 relative z-10" />
            </div>
          </div>
          <div className="text-center mb-8">
            <h1 className="text-4xl font-black text-white mb-2">Round Complete!</h1>
            <p className="text-slate-400 text-lg">{roundTotals.boardsSolved}/{roundTotals.boardsPlayed} boards fully solved</p>
          </div>

          <div className="relative rounded-2xl bg-gradient-to-br from-violet-500/20 via-emerald-600/10 to-amber-700/5 border border-violet-500/40 p-8 shadow-xl mb-8">
            <div className="relative text-center">
              <p className="text-violet-300/80 text-sm font-semibold uppercase tracking-wider mb-3">Net Points This Round</p>
              <p className={`text-7xl font-black mb-2 ${roundTotals.net < 0 ? 'text-red-300' : 'text-violet-300'}`}>{roundTotals.net}</p>
              <p className="text-violet-400/60 text-sm">{roundTotals.groupsSolved} groups solved</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Score Breakdown</h2>
            <div className="space-y-2">
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 flex items-center justify-between">
                <span className="text-slate-300 font-medium">Accrual <span className="text-slate-500 text-xs">({roundTotals.groupsSolved} groups × +{CONNECTIONS_POINTS.perGroup})</span></span>
                <span className="text-emerald-300 font-black text-xl">+{roundTotals.accrual}</span>
              </div>
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 flex items-center justify-between">
                <span className="text-slate-300 font-medium">Clean-board bonus</span>
                <span className="text-sky-300 font-black text-xl">+{roundTotals.bonus}</span>
              </div>
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 flex items-center justify-between">
                <span className="text-slate-300 font-medium">Mistake cost</span>
                <span className="text-red-300 font-black text-xl">{roundTotals.mistakeCost}</span>
              </div>
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 flex items-center justify-between">
                <span className="text-slate-300 font-medium">Floor penalty</span>
                <span className="text-red-300 font-black text-xl">{roundTotals.floor}</span>
              </div>
              <div className="rounded-lg bg-slate-800/70 border border-violet-500/30 p-4 flex items-center justify-between">
                <span className="text-white font-black">Net this round</span>
                <span className={`font-black text-xl ${roundTotals.net < 0 ? 'text-red-300' : 'text-violet-300'}`}>{roundTotals.net}</span>
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

  // 'playing' or 'boardResult'
  const boardsLabel = `Board ${Math.min(roundTotals.boardsPlayed + 1, BOARDS_PER_ROUND)} of ${BOARDS_PER_ROUND}`
  const remainingTileIds = tileOrder.filter((id) => !solvedTileIds.has(id))

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
              <p className={`text-2xl font-black ${roundTotals.net < 0 ? 'text-red-300' : 'text-violet-300'}`}>{roundTotals.net}</p>
            </div>
            {/* Mistake budget, shown as dots -- no clock in this build (§6). */}
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50">
              {Array.from({ length: CONNECTIONS_POINTS.maxMistakes }, (_, i) => (
                <span
                  key={i}
                  className={`w-2.5 h-2.5 rounded-full ${i < mistakes ? 'bg-red-400' : 'bg-slate-600'}`}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="text-slate-400 text-xs uppercase font-semibold mb-6">{boardsLabel}</p>

        {phase === 'playing' && (
          <>
            {oneAwayFlash && (
              <div className="mb-4 rounded-xl bg-amber-600/20 border border-amber-500/40 p-3 text-center text-amber-200 text-sm font-black animate-pulse">
                One away…
              </div>
            )}
            {guessError && (
              <div className="mb-4 rounded-xl bg-red-600/20 border border-red-500/40 p-3 text-center text-red-200 text-sm font-semibold">
                {guessError}
              </div>
            )}

            {/* Solved groups, lifted out and revealed */}
            {solvedGroups.length > 0 && (
              <div className="mb-4 space-y-2">
                {[...solvedGroups].sort((a, b) => a.groupOrdinal - b.groupOrdinal).map((g) => {
                  const accent = GROUP_ACCENTS[g.groupOrdinal % GROUP_ACCENTS.length]
                  return (
                    <div key={g.groupId} className={`rounded-xl border p-4 bg-gradient-to-br ${accent.bg} ${accent.border}`}>
                      <p className={`font-black text-sm mb-1 ${accent.text}`}>{g.label}</p>
                      <p className="text-slate-300 text-xs">
                        {g.tileIds.map((id) => tilesByIdRef.current.get(id)?.text ?? '').join(' · ')}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Unsolved tile grid */}
            <div className="grid grid-cols-4 gap-2 mb-6">
              {remainingTileIds.map((id) => {
                const tile = tilesByIdRef.current.get(id)
                const isSelected = selectedTileIds.includes(id)
                return (
                  <button
                    key={id}
                    onClick={() => clickTile(id)}
                    disabled={submitting}
                    className={`aspect-square rounded-lg border px-2 py-2 text-center font-bold text-xs sm:text-sm flex items-center justify-center transition-all duration-150 ${
                      isSelected
                        ? 'bg-violet-600/30 border-violet-400/70 text-violet-100 ring-2 ring-violet-400/40 scale-95'
                        : 'bg-slate-800/50 border-slate-700/50 text-slate-200 hover:border-violet-400/40'
                    }`}
                  >
                    {tile?.text}
                  </button>
                )
              })}
            </div>

            {/* Controls: shuffle, deselect all, submit */}
            <div className="flex gap-3 mb-3">
              <button
                onClick={shuffleTiles}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-800/50 border border-slate-700/50 px-4 py-3 text-slate-300 font-semibold hover:bg-slate-700/50 transition-colors"
              >
                <Shuffle className="w-4 h-4" />
                Shuffle
              </button>
              <button
                onClick={deselectAll}
                disabled={selectedTileIds.length === 0}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-800/50 border border-slate-700/50 px-4 py-3 text-slate-300 font-semibold hover:bg-slate-700/50 transition-colors disabled:opacity-40"
              >
                <RotateCcw className="w-4 h-4" />
                Deselect All
              </button>
            </div>

            <button
              onClick={submitGuess}
              disabled={selectedTileIds.length !== 4 || submitting}
              className="w-full group relative overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 p-1 shadow-lg hover:shadow-2xl transition-all duration-300 disabled:opacity-40 mb-4"
            >
              <div className="relative bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-lg px-6 py-3">
                <p className="font-black text-white text-center">
                  {submitting ? 'Checking…' : `Submit ${selectedTileIds.length}/4`}
                </p>
              </div>
            </button>

            <button
              onClick={reportAmbiguous}
              disabled={ambiguousReported}
              className="w-full flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
            >
              <Flag className="w-3.5 h-3.5" />
              {ambiguousReported ? 'Thanks -- noted' : 'This board seems ambiguous'}
            </button>
          </>
        )}

        {phase === 'boardResult' && (
          <div className="space-y-4">
            {completeError && (
              <div className="rounded-xl bg-red-600/20 border border-red-500/40 p-4 text-center">
                <p className="text-red-200 text-sm font-semibold mb-3">{completeError}</p>
                <button
                  onClick={() => retryComplete(lastScored?.groupsSolved === 4 ? 'solved' : 'budget')}
                  className="rounded-lg bg-red-600/40 border border-red-500/50 px-4 py-2 text-white text-sm font-black hover:bg-red-600/60 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}
            {lastScored && (
              <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-6">
                <div className="flex items-center gap-2 mb-4">
                  {lastScored.perfect
                    ? <Sparkles className="w-5 h-5 text-fuchsia-400" />
                    : <AlertTriangle className="w-5 h-5 text-amber-400" />}
                  <p className="font-black text-white">
                    {lastScored.perfect ? 'Perfect board!' : `${lastScored.groupsSolved}/4 groups solved`}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Accrual ({lastScored.groupsSolved}/4 × +{CONNECTIONS_POINTS.perGroup})</span>
                    <span className="text-emerald-300 font-bold">+{lastScored.accrual}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Clean-board bonus</span>
                    <span className="text-sky-300 font-bold">+{lastScored.bonus}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Mistake cost ({lastScored.mistakes} × {CONNECTIONS_POINTS.mistakePenalty})</span>
                    <span className="text-red-300 font-bold">{lastScored.mistakeCost}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Floor penalty</span>
                    <span className="text-red-300 font-bold">{lastScored.floor}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-700/50 pt-2 mt-2">
                    <span className="text-white font-black">Net</span>
                    <span className={`font-black text-xl ${(lastScored.net ?? 0) < 0 ? 'text-red-300' : 'text-violet-300'}`}>{lastScored.net}</span>
                  </div>
                </div>
              </div>
            )}
            <button
              onClick={nextBoard}
              disabled={!lastScored}
              className="w-full group relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 p-1 shadow-lg hover:shadow-2xl transition-all duration-300 disabled:opacity-40"
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
