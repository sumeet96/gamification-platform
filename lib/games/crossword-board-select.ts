// Package A6 (Task C): pure board-selection logic for crossword, mirroring
// lib/games/connections-board-select.ts's shape (see that file's header for
// the full "why least-recently-served, never hard exclusion" history -- the
// same reasoning applies here, restated below only where it differs).
//
// Difference from Connections, deliberate: no `targetDifficulty` parameter at
// all. Connections keeps one (always passed as null in that build) because
// connection_boards DOES have a nullable difficulty column that just happens
// to be unpopulated -- the parameter documents "this could be honoured once
// the column has values." crossword_boards (db/013_add_crossword.sql) has no
// difficulty column at all, so there is nothing a future population pass
// could ever light up; keeping a permanently-null parameter here would be
// asserting a possibility the schema doesn't support. selectItems is still
// called with targetDifficulty hardcoded to null internally -- the "no
// difficulty tiebreak" ranking behaviour is identical, only the unused
// parameter is dropped.
//
// Node's native TS test runner doesn't resolve the "@/*" tsconfig alias the
// route file uses, so this stays a plain relative import, same as
// connections-board-select.ts.

import { selectItems, type RankableRow } from './item-select.ts'

/** One live crossword_boards row, as the route already has it after its
 *  query -- deliberately NOT the full DB row shape (no source_id, width/
 *  height, created_at, retired_*), just what selection needs. `difficulty`
 *  is always null here (there is no such column on crossword_boards to read
 *  it from), carried only because selectItems' RankableRow shape requires
 *  the field to exist. */
export interface EligibleCrosswordBoard extends RankableRow {
  id: string
  subject: string
}

export interface CrosswordBoardSelection {
  subject: string
  boardId: string
}

/**
 * Pick ONE live board for ONE subject, given every eligible crossword_boards
 * row and how recently (if ever) this student has been served each one.
 * Returns null only when NO board exists at all -- the caller's cue for a
 * 409, never for a student who has simply seen every board in the pool;
 * recency only reorders, it never excludes (same rule as match's FIX 1c and
 * Connections' selectConnectionsBoard).
 */
export function selectCrosswordBoard(
  allBoards: readonly EligibleCrosswordBoard[],
  lastServed: ReadonlyMap<string, number>,
  randomFn: () => number = Math.random
): CrosswordBoardSelection | null {
  const bySubject = new Map<string, EligibleCrosswordBoard[]>()
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
  const selection = selectItems(subjectBoards, lastServed, null, 1, randomFn)!

  return { subject, boardId: selection.rows[0].id }
}
