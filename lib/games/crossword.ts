// Package A6: pure grid-grading + scoring logic for crossword. Framework-free
// and DB-free, same reason as lib/games/connections.ts and lib/games/match.ts
// -- testable in isolation and reusable by the (not-yet-built) submit route.
//
// Scope note: pure logic ONLY. No routes, no React, no @neondatabase/serverless
// import. Must never import resolveLever() or branch on config.lever --
// crossword declares `lever: 'both'` in ./registry.ts but deliberately does
// NOT consume it yet (see GridPoints' docstring there); this file staying
// lever-free is correct, not a gap, until that mechanic is designed.
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

export interface ScoredCrosswordBoard {
  accrual: number // perEntry x correct, PLUS perWrong x wrong (perWrong is <= 0)
  bonus: number // perfectBonus, or 0
  checkBonus: number // perUnusedCheck x unused checks -- always >= 0, spending a check costs nothing directly
  net: number
  potential: number // no-mistake-cost view: correct-only accrual + bonus + checkBonus, mirrors match's/Connections' `potential`
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
 */
export function scoreBoard(
  grading: BoardGrading,
  checksUsed: number,
  entryCount: number,
  points: GridPoints
): ScoredCrosswordBoard {
  const perfect = grading.wrong === 0 && grading.notAttempted === 0
  const accrual = grading.correct * points.perEntry + grading.wrong * points.perWrong
  const bonus = perfect ? points.perfectBonus : 0
  const unused = Math.max(0, checkBudget(entryCount, points) - checksUsed)
  const checkBonus = unused * points.perUnusedCheck

  return {
    accrual,
    bonus,
    checkBonus,
    net: accrual + bonus + checkBonus,
    potential: grading.correct * points.perEntry + bonus + checkBonus,
    perfect,
  }
}
