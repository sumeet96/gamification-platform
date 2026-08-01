// Package A1 rework, FIX 7 / FIX 8 / least-recently-served ranking: pure
// board-selection logic for match-the-following, split out of
// app/api/match/board/route.ts so it can be unit tested with fixtures instead
// of a live Neon connection (same reason lib/games/match.ts's scoring is
// DB-free -- see that file's header). Node's native TS test runner
// (`node --test`, no bundler) does not resolve the "@/*" tsconfig path alias
// the route file uses, so any logic meant to be imported by
// tests/*.test.ts has to live in a module reachable by a plain relative
// import, like this one.
//
// The original FIX 1c here was hard exclusion of already-served ids. Fixed
// 1 Aug 2026: at this pool size (as few as 18 items in a subject) hard
// exclusion keyed on a student's whole history starves them permanently
// after a handful of boards -- see the route file's header for the full
// story. Replaced with least-recently-served ranking below, which never
// makes a repeat impossible, only later.
//
// Package A3 (generalised): the actual ranking (recency-first, difficulty
// distance as a tiebreak) moved to lib/games/item-select.ts so
// choose-the-right-word (app/api/word/question/route.ts) can share it
// instead of a second copy -- see that file's header for the split. What
// stays HERE is match-specific: FIX 8's subject-grouping (a board never
// spans two subjects), which has no equivalent in choose-the-right-word's
// contract. `shuffle` also moved there; re-exported below so nothing
// importing it from here (including tests/match-board.test.ts) has to
// change. This refactor changes no behaviour -- selectBoard calls the same
// ranking in the same order it used to run inline.

import { selectItems, shuffle, type RankableRow } from './item-select.ts'

export { shuffle }

/** One eligible term_definition row, as the route already has it after its
 *  content_items query -- deliberately NOT the DB row shape (no source_id,
 *  cognitive_level, etc.), just what selection needs. */
export interface EligibleRow extends RankableRow {
  id: string
  term: string
  clue: string
  subject: string
  difficulty: number | null
}

export interface BoardSelection {
  subject: string
  rows: EligibleRow[]
  difficultyHonored: boolean
}

/**
 * Pick ONE subject and `boardSize` rows from it, given every eligible
 * term_definition row and how recently (if ever) this student has been
 * served each one. Returns null only when no subject has `boardSize` rows in
 * total -- the caller's cue to return the existing 409 for genuinely
 * insufficient content, not for a student who has simply seen a lot of it.
 *
 * Rules encoded here:
 *  - FIX 8: a board never spans two subjects -- group ALL rows by subject
 *    first (no history-based filtering), and only consider a subject with at
 *    least `boardSize` rows total. Eligibility is pool size, not history.
 *  - Least-recently-served ranking, difficulty-distance tiebreak (FIX 7):
 *    delegated to lib/games/item-select.ts's selectItems once a subject is
 *    chosen -- see that file for the ranking rules themselves. ALL
 *    term_definition rows are NULL difficulty today (the existing difficulty
 *    simulator is MCQ-only), so this always falls back to the uncalibrated
 *    path for now -- that fallback is not a bug, it's FIX 7's whole point:
 *    never claim a difficulty the board didn't actually honour.
 *    `difficultyHonored` tells the caller which happened, so it can be
 *    carried into the board token and the event log stays honest.
 */
export function selectBoard(
  allRows: readonly EligibleRow[],
  lastSeen: ReadonlyMap<string, number>,
  targetDifficulty: number | null,
  boardSize: number,
  randomFn: () => number = Math.random
): BoardSelection | null {
  const bySubject = new Map<string, EligibleRow[]>()
  for (const r of allRows) {
    const list = bySubject.get(r.subject)
    if (list) list.push(r)
    else bySubject.set(r.subject, [r])
  }
  const subjectsWithEnough = [...bySubject.entries()].filter(([, rows]) => rows.length >= boardSize)
  if (subjectsWithEnough.length === 0) return null

  const [subject, subjectRows] = subjectsWithEnough[Math.floor(randomFn() * subjectsWithEnough.length)]

  // subjectRows.length >= boardSize is guaranteed by the filter above, so
  // selectItems can never return null here -- same non-null guarantee the
  // inline version used to document.
  const selection = selectItems(subjectRows, lastSeen, targetDifficulty, boardSize, randomFn)!

  return { subject, rows: selection.rows, difficultyHonored: selection.difficultyHonored }
}
