// Package A5: pure board-selection logic for Connections, mirroring
// lib/games/match-board-select.ts's shape (see that file's header for the
// full "why least-recently-served, never hard exclusion" history -- the same
// reasoning applies here, restated below only where it differs).
//
// The key difference from match: match COMPOSES a board at request time from
// individual term_definition rows (selectItems picks BOARD_SIZE of them).
// Connections' boards are pre-authored, atomic units (one connection_boards
// row = 16 tiles across 4 groups) -- there is nothing to compose, only ONE
// board to pick out of however many a subject has. So this file selects a
// BOARD, not a set of items, but reuses the exact same ranking primitive
// (lib/games/item-select.ts's selectItems) with count=1: a board is just a
// RankableRow like any other candidate, keyed on its own id and (always-null,
// per CLAUDE.md's "no difficulty tiebreak" decision for this build)
// difficulty.
//
// Node's native TS test runner doesn't resolve the "@/*" tsconfig alias the
// route file uses, so this stays a plain relative import, same as
// match-board-select.ts and item-select.ts.

import { selectItems, type RankableRow } from './item-select.ts'

/** One live connection_boards row, as the route already has it after its
 *  query -- deliberately NOT the full DB row shape (no created_at, retired_*),
 *  just what selection needs. */
export interface EligibleConnectionsBoard extends RankableRow {
  id: string
  subject: string
  difficulty: number | null
}

export interface ConnectionsBoardSelection {
  subject: string
  boardId: string
}

/**
 * Pick ONE live board for ONE subject, given every eligible connection_boards
 * row and how recently (if ever) this student has been served each one.
 * Returns null only when NO board exists at all -- the caller's cue for a
 * 409, never for a student who has simply seen every board in the pool;
 * recency only reorders, it never excludes (same rule as match's FIX 1c/the
 * A1 8-board-lockout fix).
 *
 * `targetDifficulty` is always null for this build (§6 of
 * docs/NEXT_SESSION_BUILD_BRIEF.md, confirmed by the user 6 Aug 2026: no
 * difficulty tiebreak -- no connection_boards row has one yet either) --
 * accepting it as a parameter rather than hardcoding null inline keeps this
 * function honest about what selectItems is actually doing (ranking by
 * recency alone, difficultyHonored always false) instead of asserting that by
 * omission, and costs nothing since the caller always passes null.
 */
export function selectConnectionsBoard(
  allBoards: readonly EligibleConnectionsBoard[],
  lastServed: ReadonlyMap<string, number>,
  targetDifficulty: number | null,
  randomFn: () => number = Math.random
): ConnectionsBoardSelection | null {
  const bySubject = new Map<string, EligibleConnectionsBoard[]>()
  for (const b of allBoards) {
    const list = bySubject.get(b.subject)
    if (list) list.push(b)
    else bySubject.set(b.subject, [b])
  }
  const subjects = [...bySubject.entries()]
  if (subjects.length === 0) return null

  const [subject, subjectBoards] = subjects[Math.floor(randomFn() * subjects.length)]

  // subjectBoards.length >= 1 is guaranteed by construction (a subject only
  // ends up in the map because at least one board pushed onto it), so
  // selectItems can never return null here.
  const selection = selectItems(subjectBoards, lastServed, targetDifficulty, 1, randomFn)!

  return { subject, boardId: selection.rows[0].id }
}
