'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Trophy, Sparkles, AlertTriangle, Grid3x3, CheckCircle2, XCircle, HelpCircle, Eye, Zap, ArrowRight, Clock,
} from 'lucide-react'
import { useGame } from '@/lib/game/game-context'
import { FIXED_DIFFICULTY, type GameConfig, type RoundSummary } from '@/lib/game/engine'
import { getGame, type GridPoints } from '@/lib/games/registry'
import { checkBudget, gridSucceeded, timeBonusFor, type EntryStatus } from '@/lib/games/crossword'

// Package A6: Crossword. Structural template is app/games/connections/page.tsx
// (setup -> loading -> playing -> boardResult -> roundResult, useGame()'s
// setConfig/recordRound/registerContinue/announceRoundOffer/abandonRound/emit).
//
// TIME-LEVER-ONLY (8 Aug 2026, client slice -- supersedes the lever:'none'-
// in-practice design this comment used to describe). `GAME_REGISTRY`'s
// crossword entry declares `lever: 'time'`, and the server half (this file's
// two API routes, lib/games/crossword-lever.ts) was already resolving and
// scoring that lever before this page caught up -- two reviews flagged that
// gap as "the same class of defect as a client-supplied score, just
// inverted" (a lever the student never sees, never reacts to).
// CROSSWORD_CONFIG.lever below now matches the registry. Still no
// resolveLever() call here, though: unlike quiz/match/word, crossword has no
// client-held LeverState at all -- lib/games/crossword-lever.ts's header
// explains why the server reconstructs it from history on every request.
// This page only DISPLAYS the already-resolved `timeLimitSeconds`
// board/route.ts returns, and shows a DISPLAY-ONLY decaying time-bonus number
// computed via `timeBonusFor` (imported from lib/games/crossword.ts, the same
// pure function the server scores with) -- never sent back, never trusted;
// the server re-derives and re-scores everything off its own clock. The
// on-page clock counts UP and never force-terminates the board:
// DECISIONS.md's "terminal_reason excludes 'timeout'" ruling forbids a
// timeout ending a board the way match's countdown does.
//
// JUDGMENT CALL (not specified in the plan, flagged in the build report):
// unlike Connections/match, this page treats one crossword board as one
// ROUND (no BOARDS_PER_ROUND loop) -- the plan's own Context section notes a
// crossword board is "one long, non-linear task", not one of many short
// repeatable boards, so there is no natural "board 2 of 3" grouping the way
// Connections has. boardResult's "See Round Results" button calls
// finishRound() directly rather than fetching a second board first.

const CROSSWORD_GAME_ID = 'crossword'
const CROSSWORD_POINTS = getGame(CROSSWORD_GAME_ID).points as GridPoints
const CROSSWORD_CONFIG: GameConfig = { mode: 'none', lever: 'time', fixedDifficulty: FIXED_DIFFICULTY, ownerGameId: CROSSWORD_GAME_ID }

type Direction = 'H' | 'V'

interface EntryData {
  contentItemId: string
  clue: string
  x: number
  y: number
  direction: Direction
  length: number
  ordinal: number
}
interface BoardData {
  boardId: string; width: number; height: number; entries: EntryData[]; boardToken: string
  timeLimitSeconds: number // full-bonus window, server-resolved (board/route.ts) -- display only, see header
}

// Cell-keyed fill state, "x,y" -- matches lib/games/crossword.ts's cellKey and
// app/api/crossword/submit/route.ts's parseGrid (a plain object, never an
// array, every value a one-character string). This is the SINGLE source of
// truth two crossing entries share: typing into one entry's cell updates the
// same key a crossing entry reads.
type GridState = Record<string, string>

interface CheckResponse {
  ok: boolean
  contentItemId?: string
  correct?: boolean
  checksRemaining?: number
  error?: string
  budgetExhausted?: boolean
}
interface RevealEntry { contentItemId: string; answer: string; status: EntryStatus }
interface CompleteResponse {
  ok: boolean
  accrual?: number
  bonus?: number
  checkBonus?: number
  timeBonus?: number
  net?: number
  potential?: number
  perfect?: boolean
  checksUsed?: number
  reveal?: RevealEntry[]
  error?: string
  duplicate?: boolean
}

type Phase = 'setup' | 'loading' | 'playing' | 'boardResult' | 'roundResult'

function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

// mm:ss, floored to the second -- matches the once-a-second tick the
// elapsedMs effect drives, so the displayed clock and its own update
// cadence never disagree.
function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Same cell-span math lib/games/crossword.ts's entryCells uses, adapted to
// EntryData (which carries `length`, not the answer string the client must
// never see).
function entryCellKeys(entry: EntryData): string[] {
  const keys: string[] = []
  for (let i = 0; i < entry.length; i++) {
    const x = entry.direction === 'H' ? entry.x + i : entry.x
    const y = entry.direction === 'H' ? entry.y : entry.y + i
    keys.push(cellKey(x, y))
  }
  return keys
}

interface RoundTotals {
  net: number; potential: number; accrual: number; bonus: number; checkBonus: number; timeBonus: number
  entriesCorrect: number; entriesWrong: number; entriesNotAttempted: number; checksUsed: number
  perfect: boolean
  bestTimeMs: number | null // this round's board completion time, client-tracked -- display/telemetry only
}
const EMPTY_TOTALS: RoundTotals = {
  net: 0, potential: 0, accrual: 0, bonus: 0, checkBonus: 0, timeBonus: 0,
  entriesCorrect: 0, entriesWrong: 0, entriesNotAttempted: 0, checksUsed: 0, perfect: false,
  bestTimeMs: null,
}

// ---- Clue list, hoisted so it isn't recreated every render ------------------

interface ClueListProps {
  title: string
  entries: EntryData[]
  selectedEntryId: string | null
  entryFeedback: Record<string, 'correct' | 'wrong'>
  reveal: Map<string, RevealEntry> | null
  locked: boolean
  onSelect: (id: string) => void
}
function ClueList({ title, entries, selectedEntryId, entryFeedback, reveal, locked, onSelect }: ClueListProps) {
  if (entries.length === 0) return null
  return (
    <div className="mb-4">
      <h3 className="text-slate-400 text-xs uppercase font-semibold mb-2">{title}</h3>
      <ul className="space-y-1">
        {entries.map((e) => {
          const status = reveal?.get(e.contentItemId)?.status ?? entryFeedback[e.contentItemId]
          const isSelected = selectedEntryId === e.contentItemId
          return (
            <li key={e.contentItemId}>
              <button
                onClick={() => onSelect(e.contentItemId)}
                disabled={locked}
                className={`w-full text-left text-sm px-2 py-1.5 rounded-lg transition-colors flex items-start gap-2 disabled:opacity-70 ${
                  isSelected ? 'bg-violet-600/20 text-violet-100' : 'text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <span className="text-slate-500 font-bold w-5 flex-shrink-0">{e.ordinal}.</span>
                <span className="flex-1">{e.clue}</span>
                {status === 'correct' && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                {(status === 'wrong' || status === 'not_attempted') && <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default function CrosswordGame() {
  const router = useRouter()
  const {
    session, sessionId, studentId, setConfig, recordRound, registerContinue, announceRoundOffer, abandonRound, emit,
  } = useGame()

  const [phase, setPhase] = useState<Phase>('setup')
  const [board, setBoard] = useState<BoardData | null>(null)
  const [grid, setGrid] = useState<GridState>({})
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [entryFeedback, setEntryFeedback] = useState<Record<string, 'correct' | 'wrong'>>({})
  const [checksRemaining, setChecksRemaining] = useState(0)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [solving, setSolving] = useState(false)
  const [reveal, setReveal] = useState<Map<string, RevealEntry> | null>(null)
  const [lastScored, setLastScored] = useState<CompleteResponse | null>(null)
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [roundTotals, setRoundTotals] = useState<RoundTotals>(EMPTY_TOTALS)
  const [roundNo, setRoundNo] = useState(0)
  const [boardError, setBoardError] = useState<string | null>(null)
  // Count-up display clock (time-lever slice, 8 Aug 2026): elapsed ms since
  // boardStartRef, ticked once a second while phase === 'playing' by the
  // effect below. DISPLAY ONLY -- never sent to the server (submit/route.ts
  // measures elapsed itself, entirely inside Postgres, off the anchored
  // board_served row; see that route's header) and never used to end the
  // board -- see this file's header on why a timeout can't terminate here.
  const [elapsedMs, setElapsedMs] = useState(0)

  const boardStartRef = useRef(0)
  const checkGuardRef = useRef(false) // guards a double check-submit
  const completeGuardRef = useRef(false) // guards a double/duplicate complete submit
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  // FOUND BY ACTUALLY PLAYING (not caught by tsc/tests/build -- see AGENTS.md's
  // "open a browser" rule): selectEntry() calls setSelectedEntryId(id), a state
  // update, then synchronously calls focusCell()'s .focus(), which fires the
  // input's onFocus -> clickCell(key) handler in the SAME tick, before React has
  // re-rendered. clickCell's closure over `selectedEntryId` was therefore reading
  // the PREVIOUS entry's id, not the one just selected -- so clicking a clue whose
  // first cell is shared with a lower-ordinal crossing entry (e.g. a down clue
  // starting on an across entry's first cell) silently reselected the WRONG entry,
  // and everything typed afterward landed in the wrong grid cells. Verified end to
  // end: typing "PREDICTIVE" after clicking that exact clue landed in the crossing
  // ACROSS entry instead, confirmed via the committed board_complete event
  // (entries_correct=1, entries_wrong=1, entries_not_attempted=20 -- PREDICTIVE's
  // own cells were never touched at all). Fixed with a ref that mirrors
  // selectedEntryId SYNCHRONOUSLY, so clickCell always sees the truth regardless of
  // React's state-update timing -- state is for rendering, this ref is for any
  // logic that must be correct within the same synchronous call stack.
  const selectedEntryRef = useRef<string | null>(null)

  // ---- Derived board geometry ---------------------------------------------

  const entriesByCell = useMemo(() => {
    const m = new Map<string, string[]>()
    if (!board) return m
    for (const e of board.entries) {
      for (const k of entryCellKeys(e)) {
        const arr = m.get(k) ?? []
        arr.push(e.contentItemId)
        m.set(k, arr)
      }
    }
    return m
  }, [board])

  const entriesById = useMemo(() => {
    const m = new Map<string, EntryData>()
    board?.entries.forEach((e) => m.set(e.contentItemId, e))
    return m
  }, [board])

  // Smallest ordinal among any entry that STARTS at a given cell, for the
  // small corner numbers that correlate a cell with its clue-list entry.
  const startCellLabel = useMemo(() => {
    const m = new Map<string, number>()
    if (!board) return m
    for (const e of board.entries) {
      const k = cellKey(e.x, e.y)
      const existing = m.get(k)
      if (existing === undefined || e.ordinal < existing) m.set(k, e.ordinal)
    }
    return m
  }, [board])

  const acrossEntries = useMemo(
    () => (board ? board.entries.filter((e) => e.direction === 'H').sort((a, b) => a.ordinal - b.ordinal) : []),
    [board]
  )
  const downEntries = useMemo(
    () => (board ? board.entries.filter((e) => e.direction === 'V').sort((a, b) => a.ordinal - b.ordinal) : []),
    [board]
  )

  // ---- Board fetch ----------------------------------------------------------

  async function fetchBoard(round: number) {
    setPhase('loading')
    setBoardError(null)
    try {
      const params = new URLSearchParams({ session_id: sessionId })
      const res = await fetch(`/api/crossword/board?${params.toString()}`)
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        setBoardError(
          data?.error === 'not enough boards'
            ? 'No Crossword boards are ready yet -- try again soon.'
            : 'Could not load a board. Please try again.'
        )
        abandonRound(round, { game_type: CROSSWORD_GAME_ID, mode: CROSSWORD_CONFIG.mode, lever: CROSSWORD_CONFIG.lever })
        setPhase('setup')
        return
      }
      const entries: EntryData[] = data.entries
      setBoard({
        boardId: data.boardId, width: data.width, height: data.height, entries, boardToken: data.boardToken,
        timeLimitSeconds: typeof data.timeLimitSeconds === 'number' ? data.timeLimitSeconds : 0,
      })
      setGrid({})
      setSelectedEntryId(entries[0]?.contentItemId ?? null)
      setEntryFeedback({})
      setChecksRemaining(checkBudget(entries.length, CROSSWORD_POINTS))
      setCheckError(null)
      setSolving(false)
      setReveal(null)
      setLastScored(null)
      setCompleteError(null)
      inputRefs.current = new Map()
      boardStartRef.current = Date.now()
      setElapsedMs(0)
      setPhase('playing')
    } catch (err) {
      console.error('crossword: board fetch failed', err)
      setBoardError('Could not load a board. Please try again.')
      abandonRound(round, { game_type: CROSSWORD_GAME_ID, mode: CROSSWORD_CONFIG.mode, lever: CROSSWORD_CONFIG.lever })
      setPhase('setup')
    }
  }

  // Ticks elapsedMs once a second while actually playing -- stops (and stops
  // re-arming) the instant phase leaves 'playing', so the display clock never
  // keeps running once a board is solved/abandoned. Never terminates the
  // board itself; see this file's header.
  useEffect(() => {
    if (phase !== 'playing') return
    const iv = setInterval(() => setElapsedMs(Date.now() - boardStartRef.current), 1000)
    return () => clearInterval(iv)
  }, [phase])

  // ---- Round lifecycle --------------------------------------------------------

  function beginRound() {
    const nextRoundNo = session.roundsPlayed + 1
    setRoundNo(nextRoundNo)
    setRoundTotals(EMPTY_TOTALS)
    emit({
      event_type: 'round_start', game_type: CROSSWORD_GAME_ID,
      mode: CROSSWORD_CONFIG.mode, lever: CROSSWORD_CONFIG.lever, round: nextRoundNo,
    })
    void fetchBoard(nextRoundNo)
  }

  function startRound() {
    setConfig(CROSSWORD_CONFIG)
    beginRound()
  }

  function keepGoing() {
    registerContinue()
    beginRound()
  }

  function stopRound() {
    emit({
      event_type: 'round_stop', game_type: CROSSWORD_GAME_ID,
      mode: CROSSWORD_CONFIG.mode, lever: CROSSWORD_CONFIG.lever, round: roundNo,
    })
    router.push('/')
  }

  // Header "Exit" -- only abandons a round/board if one was actually under
  // way. A board still 'playing' also gets a best-effort terminal_reason
  // 'abandoned' complete so its partial progress isn't silently lost --
  // fire-and-forget (keepalive) since we're navigating away regardless, same
  // reasoning app/games/connections/page.tsx's exitMidRound uses.
  function exitMidRound() {
    if (phase === 'playing' && board) {
      void completeBoard('abandoned', { keepalive: true })
    }
    if (roundNo > 0) {
      abandonRound(roundNo, { game_type: CROSSWORD_GAME_ID, mode: CROSSWORD_CONFIG.mode, lever: CROSSWORD_CONFIG.lever })
    }
    router.push('/')
  }

  function finishRound() {
    const summary: RoundSummary = {
      net: roundTotals.net,
      potential: roundTotals.potential,
      correct: roundTotals.entriesCorrect,
      wrong: roundTotals.entriesWrong,
      answered: roundTotals.entriesCorrect + roundTotals.entriesWrong,
      // No adaptive difficulty concept here (crossword never ranks/ramps a
      // per-entry difficulty, see registry.ts's crossword entry) -- pinned to
      // the constant config carries, same placeholder Connections uses.
      peakDifficulty: CROSSWORD_CONFIG.fixedDifficulty,
      // Set from the board's completion time (time-lever slice, 8 Aug 2026) --
      // see applyCompleteResult, which sets roundTotals.bestTimeMs only on a
      // successful board (gridSucceeded), same "only a real success can set a
      // race time" gate match's/word's own bestTimeMs tracking uses.
      bestTimeMs: roundTotals.bestTimeMs,
      lever: CROSSWORD_CONFIG.lever,
      mode: CROSSWORD_CONFIG.mode,
      round: roundNo,
    }
    recordRound(summary)
    setPhase('roundResult')
  }

  useEffect(() => {
    if (phase !== 'roundResult') return
    announceRoundOffer(roundNo, { game_type: CROSSWORD_GAME_ID, mode: CROSSWORD_CONFIG.mode, lever: CROSSWORD_CONFIG.lever })
  }, [phase, roundNo, announceRoundOffer])

  // ---- Grid interaction ----------------------------------------------------

  function focusCell(key: string) {
    inputRefs.current.get(key)?.focus()
  }

  function selectEntry(id: string) {
    selectedEntryRef.current = id
    setSelectedEntryId(id)
    const entry = entriesById.get(id)
    if (entry) focusCell(cellKey(entry.x, entry.y))
  }

  // Clicking/focusing a cell picks which of its (possibly two, if crossed)
  // entries is "active" for auto-advance and the Check button -- keeps the
  // current selection if it already covers this cell, otherwise picks the
  // first entry that does. Reads/writes selectedEntryRef, NOT the
  // selectedEntryId state directly -- this can fire synchronously inside
  // another state update (see selectedEntryRef's declaration comment), where
  // the state closure would still be stale.
  function clickCell(key: string) {
    const covering = entriesByCell.get(key) ?? []
    if (covering.length === 0) return
    if (selectedEntryRef.current && covering.includes(selectedEntryRef.current)) return
    selectedEntryRef.current = covering[0]
    setSelectedEntryId(covering[0])
  }

  function changeCell(key: string, raw: string) {
    const letter = raw.slice(-1).replace(/[^a-zA-Z]/g, '').toUpperCase()
    setGrid((g) => {
      const next = { ...g }
      if (letter) next[key] = letter
      else delete next[key]
      return next
    })
    // Reads selectedEntryRef, not the state -- see its declaration comment.
    // The very first keystroke right after selectEntry() can still land in
    // this function before selectedEntryId's state has re-rendered; the ref
    // is always current.
    const activeEntryId = selectedEntryRef.current
    if (letter && activeEntryId) {
      const entry = entriesById.get(activeEntryId)
      if (entry) {
        const keys = entryCellKeys(entry)
        const idx = keys.indexOf(key)
        if (idx >= 0 && idx < keys.length - 1) focusCell(keys[idx + 1])
      }
    }
  }

  function keyDownCell(key: string, e: KeyboardEvent<HTMLInputElement>) {
    const activeEntryId = selectedEntryRef.current
    if (e.key === 'Backspace' && !grid[key] && activeEntryId) {
      const entry = entriesById.get(activeEntryId)
      if (entry) {
        const keys = entryCellKeys(entry)
        const idx = keys.indexOf(key)
        if (idx > 0) focusCell(keys[idx - 1])
      }
    }
  }

  // ---- Check ------------------------------------------------------------------

  async function submitCheck() {
    if (!board || !selectedEntryId || checkGuardRef.current || checksRemaining <= 0) return
    checkGuardRef.current = true
    setChecking(true)
    setCheckError(null)
    const elapsed = Date.now() - boardStartRef.current
    try {
      const res = await fetch('/api/crossword/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'check',
          session_id: sessionId,
          client_student_id: studentId ?? undefined,
          board_token: board.boardToken,
          round: roundNo,
          content_item_id: selectedEntryId,
          grid,
          time_taken_ms: elapsed,
        }),
      })
      const data = (await res.json()) as CheckResponse
      if (!res.ok || !data?.ok) {
        if (data?.budgetExhausted) {
          setChecksRemaining(0) // server's own ceiling -- not a locally-decremented guess
          setCheckError('No checks left on this board.')
        } else {
          setCheckError('Could not check that entry. Try again.')
        }
        return
      }
      if (data.contentItemId) {
        setEntryFeedback((f) => ({ ...f, [data.contentItemId!]: data.correct ? 'correct' : 'wrong' }))
      }
      // checksRemaining is ALWAYS taken from the server's response, never
      // decremented locally, so a retried/raced check can never drift from
      // what the route actually counted.
      if (typeof data.checksRemaining === 'number') setChecksRemaining(data.checksRemaining)
    } catch (err) {
      console.error('crossword: check failed', err)
      setCheckError('Could not check that entry. Try again.')
    } finally {
      checkGuardRef.current = false
      setChecking(false)
    }
  }

  // ---- Complete -----------------------------------------------------------------

  function applyCompleteResult(data: CompleteResponse, elapsedMsAtSubmit: number) {
    const revealList = data.reveal ?? []
    const entriesCorrect = revealList.filter((r) => r.status === 'correct').length
    const entriesWrong = revealList.filter((r) => r.status === 'wrong').length
    const entriesNotAttempted = revealList.filter((r) => r.status === 'not_attempted').length
    setRoundTotals({
      net: data.net ?? 0,
      potential: data.potential ?? 0,
      accrual: data.accrual ?? 0,
      bonus: data.bonus ?? 0,
      checkBonus: data.checkBonus ?? 0,
      timeBonus: data.timeBonus ?? 0,
      entriesCorrect,
      entriesWrong,
      entriesNotAttempted,
      // Read from the server's own authoritative count, never reconstructed
      // from the client's locally-tracked checksRemaining -- that local
      // value is only as fresh as the last 'check' response this tab saw
      // and would drift from the true committed total under any of the
      // concurrency edge cases documented in the submit route.
      checksUsed: data.checksUsed ?? 0,
      perfect: data.perfect ?? false,
      // Client-tracked completion time (telemetry/display only, same posture
      // as match's/word's own bestTimeMs -- never the value the server
      // actually scored the time bonus against). Only set on a genuine
      // success (gridSucceeded, the same threshold the server folds into this
      // student's own lever history) -- an abandoned or mostly-empty board
      // never gets to claim a race time.
      bestTimeMs: gridSucceeded(entriesCorrect, entriesCorrect + entriesWrong + entriesNotAttempted)
        ? elapsedMsAtSubmit
        : null,
    })
    if (revealList.length > 0) {
      const revealMap = new Map(revealList.map((r) => [r.contentItemId, r]))
      setReveal(revealMap)
      // Apply the reveal: every non-correct entry's cells are overwritten
      // letter-by-letter with the true answer. Correct entries stay exactly
      // as the student left them.
      setGrid((g) => {
        const next = { ...g }
        for (const r of revealList) {
          if (r.status === 'correct') continue
          const entry = entriesById.get(r.contentItemId)
          if (!entry) continue
          entryCellKeys(entry).forEach((k, i) => {
            next[k] = r.answer[i]?.toUpperCase() ?? ''
          })
        }
        return next
      })
    }
    setLastScored(data)
    setPhase('boardResult')
  }

  async function completeBoard(reason: 'solved' | 'abandoned', opts?: { keepalive?: boolean }) {
    if (!board || completeGuardRef.current) return
    completeGuardRef.current = true
    const elapsed = Date.now() - boardStartRef.current
    try {
      const res = await fetch('/api/crossword/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        keepalive: opts?.keepalive ?? false,
        body: JSON.stringify({
          kind: 'complete',
          session_id: sessionId,
          client_student_id: studentId ?? undefined,
          board_token: board.boardToken,
          round: roundNo,
          grid,
          time_taken_ms: elapsed,
          terminal_reason: reason,
          // One board == one round in this build (see header) -- there is no
          // prior board's net within the round to carry forward.
          round_net_before: 0,
        }),
      })
      if (reason === 'abandoned') return // fire-and-forget: navigating away regardless
      const data = (await res.json()) as CompleteResponse
      if (!res.ok || !data?.ok) {
        if (data?.duplicate && data.reveal) {
          // The first attempt's response was lost (network drop, tab
          // suspend) but the server already scored it -- reconcile from the
          // read-back instead of dead-ending here, same FIX 7 pattern
          // Connections' completeBoard uses.
          applyCompleteResult(data, elapsed)
          return
        }
        console.error('crossword: submit complete failed', data)
        setCompleteError('Could not finalise this board -- your score may not be saved. Try again.')
        return
      }
      applyCompleteResult(data, elapsed)
    } catch (err) {
      if (reason === 'abandoned') return
      console.error('crossword: submit complete request failed', err)
      setCompleteError('Could not finalise this board -- your score may not be saved. Try again.')
    } finally {
      completeGuardRef.current = false
      setSolving(false)
    }
  }

  function solveBoard() {
    if (solving) return
    setSolving(true)
    void completeBoard('solved')
  }

  function retryComplete() {
    completeGuardRef.current = false
    solveBoard()
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
            <h1 className="text-4xl font-black text-white mb-2">Crossword</h1>
            <p className="text-slate-400">Fill the grid from the clues. A limited number of checks are available per board.</p>
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
                <p className="text-slate-300 text-sm font-semibold">Each correct entry: <span className="text-emerald-300">+{CROSSWORD_POINTS.perEntry}</span></p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-red-400 rounded-full" /></div>
                <p className="text-slate-300 text-sm font-semibold">Each wrong (fully filled) entry: <span className="text-red-300">{CROSSWORD_POINTS.perWrong}</span></p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-sky-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-sky-400 rounded-full" /></div>
                <p className="text-slate-300 text-sm font-semibold">Perfect board: <span className="text-sky-300">+{CROSSWORD_POINTS.perfectBonus}</span></p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-sky-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-sky-400 rounded-full" /></div>
                <p className="text-slate-300 text-sm font-semibold">Each unused check: <span className="text-sky-300">+{CROSSWORD_POINTS.perUnusedCheck}</span></p>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-amber-500/20 p-2 flex-shrink-0"><div className="w-2 h-2 bg-amber-400 rounded-full" /></div>
                <p className="text-slate-300 text-sm font-semibold">Finish fast: up to <span className="text-amber-300">+{CROSSWORD_POINTS.maxTimeBonus}</span> time bonus, decaying the longer you take</p>
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
            <p className="text-slate-400 text-lg">{roundTotals.entriesCorrect} entries solved</p>
          </div>

          <div className="relative rounded-2xl bg-gradient-to-br from-violet-500/20 via-emerald-600/10 to-amber-700/5 border border-violet-500/40 p-8 shadow-xl mb-8">
            <div className="relative text-center">
              <p className="text-violet-300/80 text-sm font-semibold uppercase tracking-wider mb-3">Net Points This Round</p>
              <p className={`text-7xl font-black mb-2 ${roundTotals.net < 0 ? 'text-red-300' : 'text-violet-300'}`}>{roundTotals.net}</p>
              <p className="text-violet-400/60 text-sm">{roundTotals.checksUsed} checks used</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">Score Breakdown</h2>
            <div className="space-y-2">
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 flex items-center justify-between">
                <span className="text-slate-300 font-medium">Accrual <span className="text-slate-500 text-xs">({roundTotals.entriesCorrect} correct, {roundTotals.entriesWrong} wrong)</span></span>
                <span className="text-emerald-300 font-black text-xl">+{roundTotals.accrual}</span>
              </div>
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 flex items-center justify-between">
                <span className="text-slate-300 font-medium">Perfect-board bonus</span>
                <span className="text-sky-300 font-black text-xl">+{roundTotals.bonus}</span>
              </div>
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 flex items-center justify-between">
                <span className="text-slate-300 font-medium">Unused-check bonus</span>
                <span className="text-sky-300 font-black text-xl">+{roundTotals.checkBonus}</span>
              </div>
              <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-4 flex items-center justify-between">
                <span className="text-slate-300 font-medium">Time bonus</span>
                <span className="text-sky-300 font-black text-xl">+{roundTotals.timeBonus}</span>
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
  const locked = phase === 'boardResult'

  // Display-only decay curve, mirroring lib/games/crossword.ts's timeBonusFor
  // exactly (imported, not reimplemented) so what the student watches tick
  // down during play is the same curve the server actually scores against --
  // it is never sent back, and the server never reads windowMs/liveTimeBonus
  // from anything client-supplied; see this file's header.
  const windowMs = board.timeLimitSeconds * 1000
  const liveTimeBonus = timeBonusFor(elapsedMs, windowMs, CROSSWORD_POINTS.maxTimeBonus)
  const decaying = windowMs > 0 && elapsedMs > windowMs

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={exitMidRound} className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors">
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-semibold">Exit</span>
          </button>
          <div className="flex items-center gap-4">
            {phase === 'playing' && (
              <div className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                decaying ? 'bg-amber-500/20 border border-amber-500/40' : 'bg-slate-800/50 border border-slate-700/50'
              }`}>
                <Clock className={`w-4 h-4 ${decaying ? 'text-amber-400' : 'text-slate-400'}`} />
                <div className="text-right">
                  <p className={`font-black text-sm leading-tight ${decaying ? 'text-amber-300' : 'text-slate-200'}`}>
                    {formatElapsed(elapsedMs)}
                  </p>
                  <p className="text-[10px] text-slate-500 font-semibold leading-tight">+{liveTimeBonus} time bonus</p>
                </div>
              </div>
            )}
            <div className="text-center">
              <p className="text-slate-400 text-xs uppercase font-semibold">Checks Left</p>
              <p className="text-2xl font-black text-violet-300">{checksRemaining}</p>
            </div>
          </div>
        </div>

        {phase === 'playing' && (
          <>
            {checkError && (
              <div className="mb-4 rounded-xl bg-red-600/20 border border-red-500/40 p-3 text-center text-red-200 text-sm font-semibold">
                {checkError}
              </div>
            )}

            {/* Grid -- simple scrollable div, no pan/zoom viewport (deferred per plan) */}
            <div className="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-900/40 p-3 mb-6">
              <div
                className="grid gap-[2px] mx-auto"
                style={{ gridTemplateColumns: `repeat(${board.width}, minmax(28px, 1fr))`, width: 'max-content' }}
              >
                {Array.from({ length: board.height }, (_, y) =>
                  Array.from({ length: board.width }, (_, x) => {
                    const key = cellKey(x, y)
                    const covering = entriesByCell.get(key) ?? []
                    if (covering.length === 0) {
                      return <div key={key} className="w-8 h-8 sm:w-9 sm:h-9" />
                    }
                    const isActive = selectedEntryId ? covering.includes(selectedEntryId) : false
                    const label = startCellLabel.get(key)
                    const revealStatus = covering.map((id) => reveal?.get(id)?.status).find(Boolean)
                    const checkStatus = covering.map((id) => entryFeedback[id]).find(Boolean)
                    const status = revealStatus ?? checkStatus
                    return (
                      <div key={key} className="relative w-8 h-8 sm:w-9 sm:h-9">
                        {label !== undefined && (
                          <span className="absolute top-0 left-0.5 text-[8px] leading-none text-slate-500 font-bold pointer-events-none z-10">
                            {label}
                          </span>
                        )}
                        <input
                          ref={(el) => {
                            if (el) inputRefs.current.set(key, el)
                            else inputRefs.current.delete(key)
                          }}
                          value={grid[key] ?? ''}
                          onChange={(e) => changeCell(key, e.target.value)}
                          onKeyDown={(e) => keyDownCell(key, e)}
                          onFocus={() => clickCell(key)}
                          maxLength={2}
                          disabled={locked}
                          className={`w-full h-full text-center text-sm sm:text-base font-black uppercase rounded-sm border outline-none transition-colors ${
                            status === 'correct'
                              ? 'bg-emerald-600/30 border-emerald-500/60 text-emerald-100'
                              : status === 'wrong' || status === 'not_attempted'
                                ? 'bg-red-600/30 border-red-500/60 text-red-100'
                                : isActive
                                  ? 'bg-violet-600/20 border-violet-400/60 text-white'
                                  : 'bg-slate-800/60 border-slate-700/50 text-slate-100'
                          }`}
                        />
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Clue lists */}
            <ClueList
              title="Across" entries={acrossEntries} selectedEntryId={selectedEntryId}
              entryFeedback={entryFeedback} reveal={reveal} locked={locked} onSelect={selectEntry}
            />
            <ClueList
              title="Down" entries={downEntries} selectedEntryId={selectedEntryId}
              entryFeedback={entryFeedback} reveal={reveal} locked={locked} onSelect={selectEntry}
            />

            {/* Check / Solve */}
            <div className="flex gap-3 mt-2">
              <button
                onClick={submitCheck}
                disabled={!selectedEntryId || checking || checksRemaining <= 0}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-800/50 border border-slate-700/50 px-4 py-3 text-slate-200 font-semibold hover:bg-slate-700/50 transition-colors disabled:opacity-40"
              >
                <HelpCircle className="w-4 h-4" />
                {checking ? 'Checking…' : `Check (${checksRemaining} left)`}
              </button>
              <button
                onClick={solveBoard}
                disabled={solving}
                className="flex-1 group relative overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 p-1 shadow-lg hover:shadow-2xl transition-all duration-300 disabled:opacity-40"
              >
                <div className="relative bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-lg px-4 py-2.5 flex items-center justify-center gap-2">
                  <Eye className="w-4 h-4 text-white" />
                  <p className="font-black text-white">{solving ? 'Solving…' : 'Solve'}</p>
                </div>
              </button>
            </div>
          </>
        )}

        {phase === 'boardResult' && (
          <>
            {/* Grid + clues stay visible, read-only, with the reveal applied */}
            <div className="overflow-x-auto rounded-xl border border-slate-700/50 bg-slate-900/40 p-3 mb-6">
              <div
                className="grid gap-[2px] mx-auto"
                style={{ gridTemplateColumns: `repeat(${board.width}, minmax(28px, 1fr))`, width: 'max-content' }}
              >
                {Array.from({ length: board.height }, (_, y) =>
                  Array.from({ length: board.width }, (_, x) => {
                    const key = cellKey(x, y)
                    const covering = entriesByCell.get(key) ?? []
                    if (covering.length === 0) {
                      return <div key={key} className="w-8 h-8 sm:w-9 sm:h-9" />
                    }
                    const label = startCellLabel.get(key)
                    const revealStatus = covering.map((id) => reveal?.get(id)?.status).find(Boolean)
                    return (
                      <div key={key} className="relative w-8 h-8 sm:w-9 sm:h-9">
                        {label !== undefined && (
                          <span className="absolute top-0 left-0.5 text-[8px] leading-none text-slate-500 font-bold pointer-events-none z-10">
                            {label}
                          </span>
                        )}
                        <input
                          value={grid[key] ?? ''}
                          readOnly
                          disabled
                          className={`w-full h-full text-center text-sm sm:text-base font-black uppercase rounded-sm border outline-none ${
                            revealStatus === 'correct'
                              ? 'bg-emerald-600/30 border-emerald-500/60 text-emerald-100'
                              : revealStatus === 'wrong' || revealStatus === 'not_attempted'
                                ? 'bg-red-600/30 border-red-500/60 text-red-100'
                                : 'bg-slate-800/60 border-slate-700/50 text-slate-100'
                          }`}
                        />
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="space-y-4">
              {completeError && (
                <div className="rounded-xl bg-red-600/20 border border-red-500/40 p-4 text-center">
                  <p className="text-red-200 text-sm font-semibold mb-3">{completeError}</p>
                  <button
                    onClick={retryComplete}
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
                      {lastScored.perfect ? 'Perfect board!' : `${roundTotals.entriesCorrect}/${board.entries.length} entries solved`}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Accrual ({roundTotals.entriesCorrect} × +{CROSSWORD_POINTS.perEntry}, {roundTotals.entriesWrong} × {CROSSWORD_POINTS.perWrong})</span>
                      <span className="text-emerald-300 font-bold">+{lastScored.accrual}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Perfect-board bonus</span>
                      <span className="text-sky-300 font-bold">+{lastScored.bonus}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Unused-check bonus ({roundTotals.checksUsed} used)</span>
                      <span className="text-sky-300 font-bold">+{lastScored.checkBonus}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-400">Time bonus</span>
                      <span className="text-sky-300 font-bold">+{lastScored.timeBonus ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-700/50 pt-2 mt-2">
                      <span className="text-white font-black">Net</span>
                      <span className={`font-black text-xl ${(lastScored.net ?? 0) < 0 ? 'text-red-300' : 'text-violet-300'}`}>{lastScored.net}</span>
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={finishRound}
                disabled={!lastScored}
                className="w-full group relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 p-1 shadow-lg hover:shadow-2xl transition-all duration-300 disabled:opacity-40"
              >
                <div className="relative bg-gradient-to-r from-blue-600 to-cyan-600 rounded-lg px-6 py-3">
                  <p className="font-black text-white text-center">See Round Results</p>
                </div>
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
