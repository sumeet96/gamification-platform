// Package A6, time-lever slice (8 Aug 2026): DB-touching glue between
// crossword's SERVER-side time lever (pure logic: lib/game/engine.ts's
// initialLeverState/advanceLeverState/reconstructLeverState/resolveLever, and
// this file's own gridSucceeded/CROSSWORD_LEVER_LOOKBACK imports from
// lib/games/crossword.ts) and the two routes that both need the SAME
// resolved window: app/api/crossword/board/route.ts (GET, display-only --
// returns the window so a later client slice can show it before play
// starts) and app/api/crossword/submit/route.ts (POST 'complete',
// AUTHORITATIVE -- the window this function returns is what actually gates
// GridPoints.maxTimeBonus via lib/games/crossword.ts's timeBonusFor). One
// function, not two hand-copied queries, so the number a student is
// eventually shown and the number that actually scores them can never drift
// apart -- exactly the property the build spec's point 6 calls out.
//
// Kept out of lib/games/crossword.ts on purpose: that file's whole point is
// staying framework-free/DB-free/pure (see its own header) so it is unit
// testable without a database. This file is the opposite -- Neon-only glue,
// the same relationship lib/games/crossword-board-select.ts has to
// lib/game/item-select.ts.
//
// Node's native TS test runner doesn't resolve the "@/*" tsconfig alias the
// route files use, so this stays plain relative imports, same as
// crossword-board-select.ts.

import type { NeonQueryFunction } from '@neondatabase/serverless'
import {
  type GameConfig,
  type LeverState,
  resolveLever,
  reconstructLeverState,
  FIXED_DIFFICULTY,
} from '../game/engine.ts'
import { gridSucceeded, CROSSWORD_LEVER_LOOKBACK } from './crossword.ts'

type Sql = NeonQueryFunction<false, false>

/** Crossword has no setup screen and no persisted client GameConfig (see
 *  registry.ts's crossword entry) -- this is the one, server-only config
 *  every reconstruction call below resolves against. `fixedDifficulty` is
 *  inert: `lever: 'time'` pins `difficulty` to it inside resolveLever, but
 *  crossword never reads that pinned value (it has no difficulty mechanic at
 *  all) -- carried only because GameConfig requires the field to exist. */
export const CROSSWORD_LEVER_CONFIG: GameConfig = {
  mode: 'none',
  lever: 'time',
  fixedDifficulty: FIXED_DIFFICULTY,
  ownerGameId: 'crossword',
}

type PriorBoardRow = {
  entries_correct: number | null
  entries_wrong: number | null
  entries_not_attempted: number | null
}

/**
 * The full-bonus time window (SECONDS) for this student's next crossword
 * board, reconstructed from their own crossword `board_complete` history --
 * never from anything client-supplied, and never from a persisted
 * server-side session either (there isn't one; each call rebuilds state from
 * scratch). Bounded to the most recent CROSSWORD_LEVER_LOOKBACK boards (see
 * that constant's own comment in crossword.ts for why): a fixed, small row
 * count regardless of how long a student has been playing, so old play
 * cannot permanently pin today's window and the query stays cheap.
 *
 * Fails OPEN to the streak-0 base window (GRID_TIME_BASE) on any DB error --
 * losing "reflect recent performance" for one request is a data-quality
 * regression, not the scoring-integrity property this mechanism protects: a
 * lost lookup only ever produces the SLOWER, more generous base window,
 * never a tighter one the student couldn't have earned.
 */
export async function resolveCrosswordTimeWindowSeconds(
  sql: Sql,
  studentId: string,
  logLabel: string
): Promise<number> {
  let rows: PriorBoardRow[] = []
  try {
    rows = (await sql`
      select entries_correct, entries_wrong, entries_not_attempted
      from events
      where event_type = 'board_complete'
        and game_type = 'crossword'
        and student_id = ${studentId}
      order by id desc
      limit ${CROSSWORD_LEVER_LOOKBACK}
    `) as PriorBoardRow[]
  } catch (err) {
    console.error(`${logLabel}: crossword lever-history lookup failed, falling back to the base window`, err)
    rows = []
  }
  // The query returns most-recent-first; reconstructLeverState requires
  // oldest-first (advanceLeverState is order-sensitive), so reverse before
  // folding. An empty/failed lookup naturally folds to initialLeverState
  // (streak 0), which is exactly the fail-open base window described above.
  const history = rows
    .slice()
    .reverse()
    .map((r) => {
      const total = (r.entries_correct ?? 0) + (r.entries_wrong ?? 0) + (r.entries_not_attempted ?? 0)
      return gridSucceeded(r.entries_correct ?? 0, total)
    })
  const state: LeverState = reconstructLeverState(CROSSWORD_LEVER_CONFIG, history)
  return resolveLever(CROSSWORD_LEVER_CONFIG, state, 'grid').timeLimit
}
