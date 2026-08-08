// Package A6: pure grid-grading + scoring logic for crossword. Framework-free
// and DB-free, same reason as lib/games/connections.ts and lib/games/match.ts
// -- testable in isolation and reusable by app/api/crossword/submit/route.ts.
//
// Scope note: pure logic ONLY. No routes, no React, no @neondatabase/serverless
// import. This file still never imports resolveLever()/reconstructLeverState
// or branches on config.lever directly -- but as of 8 Aug 2026 (the time-lever
// slice) it IS lever-aware in a narrow, one-directional sense: gridSucceeded
// and CROSSWORD_LEVER_LOOKBACK below exist specifically to feed
// lib/games/crossword-lever.ts (the DB-touching glue file that actually calls
// lib/game/engine.ts's reconstructLeverState/resolveLever, kept OUT of this
// file so this one stays unit-testable without a database). gradeEntry/
// gradeBoard/scoreBoard themselves remain fully lever-independent --
// scoreBoard below takes an already-computed `timeBonus` number, never a
// GameConfig/LeverState, and never resolves a window itself. crossword
// declares `lever: 'time'` in ./registry.ts (superseding the earlier,
// provisional `'both'`) -- difficulty stays structurally unconsumable (see
// that entry's comments); only the time half is real.
//
// A board is a fixed grid of entries (db/013_add_crossword.sql), each entry
// mapping to exactly one content_items row. Boards are authored offline and
// persisted, never built at request time -- this file only grades an
// already-filled grid against an already-constructed board.

import type { GridPoints } from './registry.ts'

export type Direction = 'H' | 'V'

/** One placed entry on the board, as the SERVER knows it -- includes the
 *  answer. Never serialise `answer` to the client before the entry grades
 *  correct, or before the board is solved/revealed -- same "no answer key in
 *  the client bundle" rule as every other game. */
export interface CrosswordEntry {
  contentItemId: string
  answer: string // the fragment, e.g. "EMPATHY" -- compared case-insensitively
  x: number
  y: number
  direction: Direction
}

export interface CrosswordBoard {
  boardId: string
  subject: string
  entries: readonly CrosswordEntry[]
}

/** The grid as the student has filled it so far: one letter per CELL, not
 *  per entry -- this is the real physical crossword, where two crossing
 *  entries share a single cell value (typing into one can fill a cell of the
 *  other). Keyed "x,y", matching scripts/spike-crossword-density.mjs's and
 *  db/013's coordinate convention. */
export type GridState = ReadonlyMap<string, string>

function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

function entryCells(entry: CrosswordEntry): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = []
  for (let i = 0; i < entry.answer.length; i++) {
    cells.push(entry.direction === 'H' ? { x: entry.x + i, y: entry.y } : { x: entry.x, y: entry.y + i })
  }
  return cells
}

export type EntryStatus = 'correct' | 'wrong' | 'not_attempted'

/**
 * Grade one entry against the current grid state. An entry counts as
 * ATTEMPTED only when every one of its cells is filled -- decided explicitly
 * (7 Aug 2026, user's design call) over grading a partial fill as wrong. A
 * down entry that is only partially filled as spillover from crossing across
 * answers stays 'not_attempted', never 'wrong': grading per fully-filled
 * entry, not per cell, means a stray incomplete crossing word is never
 * billed as a mistake it wasn't actually attempted.
 *
 * Residual coupling, ACCEPTED not fixed (7 Aug 2026): if two crossing entries
 * are BOTH fully filled and their shared cell disagrees, that cannot happen
 * for the correct answer pair -- db/013's canPlace()-derived invariant means
 * a correctly authored board's two correct strings always agree at every
 * shared cell -- but a student's WRONG letter at a shared cell can make BOTH
 * entries that cross there grade wrong off that one mistake. This is a real
 * double-bill, structurally different from the partial-fill case above, and
 * was deliberately left as-is rather than solved with a second rule.
 */
export function gradeEntry(entry: CrosswordEntry, grid: GridState): EntryStatus {
  const letters: string[] = []
  for (const { x, y } of entryCells(entry)) {
    const letter = grid.get(cellKey(x, y))
    if (letter === undefined) return 'not_attempted'
    letters.push(letter)
  }
  return letters.join('').toUpperCase() === entry.answer.toUpperCase() ? 'correct' : 'wrong'
}

export interface BoardGrading {
  correct: number
  wrong: number
  notAttempted: number
  statuses: ReadonlyMap<string, EntryStatus> // keyed by contentItemId
}

/** Grade every entry on a board against the current grid state. Pure --
 *  reads nothing but its arguments. */
export function gradeBoard(board: CrosswordBoard, grid: GridState): BoardGrading {
  const statuses = new Map<string, EntryStatus>()
  let correct = 0
  let wrong = 0
  let notAttempted = 0
  for (const entry of board.entries) {
    const status = gradeEntry(entry, grid)
    statuses.set(entry.contentItemId, status)
    if (status === 'correct') correct++
    else if (status === 'wrong') wrong++
    else notAttempted++
  }
  return { correct, wrong, notAttempted, statuses }
}

/**
 * The check budget for a board: floor(entryCount / points.checkBudgetDivisor)
 * -- e.g. 3 on a 10-entry board at the decided divisor of 3. Pulled out as
 * its own function so the route and the client's local "N checks left"
 * display can never drift (same reasoning as isMistakeBudgetExhausted in
 * lib/games/connections.ts).
 */
export function checkBudget(entryCount: number, points: GridPoints): number {
  return Math.floor(entryCount / points.checkBudgetDivisor)
}

/** Did this GRID count as a success for the time lever? Mirrors
 *  lib/games/match.ts's `boardSucceeded` exactly (same "strictly more than
 *  half" threshold) -- the board-grained analogue of one correct answer,
 *  restated for crossword's entry-count grain instead of match's pair-count
 *  grain. Used only to fold a student's crossword history into a LeverState
 *  server-side (lib/games/crossword-lever.ts's resolveCrosswordTimeWindowSeconds)
 *  -- gradeEntry/gradeBoard/scoreBoard never call this; GRADING itself stays
 *  fully lever-independent. */
export function gridSucceeded(correct: number, total: number): boolean {
  return total > 0 && correct * 2 > total
}

/** Bounded lookback for server-side lever-state reconstruction
 *  (lib/games/crossword-lever.ts): the most recent N `board_complete` rows
 *  for a student, never their entire crossword history. 10 mirrors quiz's/
 *  match's own round lengths in order of magnitude -- enough boards to smooth
 *  single-board noise out of the streak (the same smoothing INTENT as
 *  adaptive difficulty's two-consecutive rule, lib/game/engine.ts's
 *  nextDifficulty, applied here to board count rather than answer count)
 *  without letting a whole pilot's worth of play permanently pin today's
 *  window, and it caps the lookback query to a small fixed row count no
 *  matter how long a student has been playing crossword. */
export const CROSSWORD_LEVER_LOOKBACK = 10

/**
 * The time-bonus component of a board's score (8 Aug 2026, time-lever
 * slice): full `maxBonus` while `elapsedMs` is within `windowMs` (the
 * resolved full-bonus window from lib/game/engine.ts's
 * `resolveLever(..., 'grid')`), decaying LINEARLY to zero over a FURTHER
 * window's worth of time, floored at zero -- same "never negative" posture
 * as `scoreBoard`'s `checkBonus` (an unused-check floor of 0, never a
 * punishment). `elapsedMs` must always be the SERVER-authoritative value
 * (derived from the `board_served` event's own timestamp,
 * app/api/crossword/submit/route.ts), never the client-reported
 * `time_taken_ms` -- see that route's header.
 *
 * Boundary, exact: `elapsedMs === windowMs` still pays the FULL bonus (`<=`,
 * not `<`); `elapsedMs === 2 * windowMs` pays exactly zero, not a rounding
 * sliver either side. `elapsedMs` past `2 * windowMs` also pays exactly
 * zero -- decay never goes negative and is never extrapolated past the floor.
 */
export function timeBonusFor(elapsedMs: number, windowMs: number, maxBonus: number): number {
  if (maxBonus <= 0 || windowMs <= 0) return 0
  if (elapsedMs <= windowMs) return maxBonus
  const over = elapsedMs - windowMs
  if (over >= windowMs) return 0
  return Math.max(0, Math.round(maxBonus * (1 - over / windowMs)))
}

export interface ScoredCrosswordBoard {
  accrual: number // perEntry x correct, PLUS perWrong x wrong (perWrong is <= 0)
  bonus: number // perfectBonus, or 0
  checkBonus: number // perUnusedCheck x unused checks -- always >= 0, spending a check costs nothing directly
  timeBonus: number // timeBonusFor's output -- always >= 0, see that function's docstring
  net: number
  potential: number // no-mistake-cost view: correct-only accrual + bonus + checkBonus + timeBonus, mirrors match's/Connections' `potential`
  perfect: boolean
}

/**
 * Score a board given its grading and how many checks were spent.
 * `entryCount` is the board's total entry count (needed to compute the check
 * budget) -- pass board.entries.length; kept as a separate argument so this
 * function only needs the grading result, not the full board.
 *
 * `perfect` (the clean bonus) requires zero wrong AND zero not-attempted --
 * a board with unattempted entries never qualifies even with nothing wrong
 * submitted (7 Aug 2026, explicit user call: the bonus is for a FULLY solved
 * board, not merely a mistake-free partial one).
 *
 * Spending a check costs nothing directly -- it does not touch `accrual` or
 * any entry's own grade. The entire cost of using checks is the forgone
 * `checkBonus` on whatever was spent, computed here from `checksUsed` alone.
 *
 * `timeBonus` (added 8 Aug 2026, time-lever slice) is the ONE component this
 * function does not compute itself -- it is handed in already-resolved
 * (`timeBonusFor` above, fed by lib/games/crossword-lever.ts's server-side
 * window resolution), because computing it here would require this file to
 * import lib/game/engine.ts and take a GameConfig/LeverState, breaking the
 * DB-free-pure-logic contract this file's header describes. Defaults to 0 so
 * every pre-existing call site (and every pre-existing test) is unaffected.
 * Floored defensively at 0 here too, even though `timeBonusFor` already
 * guarantees that -- same belt-and-braces posture as `unused` above.
 *
 * FIXED 8 Aug 2026 (HIGH 1, adversarial review): `checkBonus` and `timeBonus`
 * are now both scaled by `fractionCorrect` (`correct / entryCount`) before
 * being added to `net`. Before this fix, neither bonus had any dependency on
 * how much of the board was actually attempted -- an empty (0 correct / all
 * not-attempted) board still paid the FULL checkBonus (every check unused)
 * and the FULL timeBonus (submitted in a couple of seconds), because
 * `checkBonus` only ever looked at `checksUsed` and `timeBonus` only ever
 * looked at elapsed time -- neither read `grading.correct` at all. A student
 * could click Solve immediately, submit nothing, and farm
 * `floor(entryCount/3) x perUnusedCheck + maxTimeBonus` points every few
 * seconds. Scaling by `fractionCorrect` is smooth, not a cliff: a
 * nearly-complete fast board still earns nearly all of both bonuses, an
 * empty one earns none of either, and a fully-correct board (fraction 1) is
 * numerically unaffected -- every pre-existing test that scores a 100%-
 * correct board still gets the same numbers. `entryCount` is always > 0 for
 * a real board (crossword_entries has at least one row per board, enforced
 * at authoring time) but guarded anyway rather than asserted, same posture
 * as this file's other divisions.
 */
export function scoreBoard(
  grading: BoardGrading,
  checksUsed: number,
  entryCount: number,
  points: GridPoints,
  timeBonus: number = 0
): ScoredCrosswordBoard {
  const perfect = grading.wrong === 0 && grading.notAttempted === 0
  const accrual = grading.correct * points.perEntry + grading.wrong * points.perWrong
  const bonus = perfect ? points.perfectBonus : 0
  const unused = Math.max(0, checkBudget(entryCount, points) - checksUsed)
  const fractionCorrect = entryCount > 0 ? grading.correct / entryCount : 0
  const checkBonus = Math.round(unused * points.perUnusedCheck * fractionCorrect)
  const safeTimeBonus = Math.round(Math.max(0, timeBonus) * fractionCorrect)

  return {
    accrual,
    bonus,
    checkBonus,
    timeBonus: safeTimeBonus,
    net: accrual + bonus + checkBonus + safeTimeBonus,
    potential: grading.correct * points.perEntry + bonus + checkBonus + safeTimeBonus,
    perfect,
  }
}
