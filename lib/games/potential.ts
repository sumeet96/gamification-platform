// Extracted from app/api/stats/route.ts so it's importable under `node --test` without
// pulling in getCurrentStudent -> next/headers, which does not resolve outside the
// Next.js server runtime. Pure function: reads GAME_REGISTRY and nothing else -- no DB,
// no session, no request.
//
// The max a student could have earned given what they actually attempted, per game_type.
// Package A1 gave the registry three points shapes (FlatPoints, GuessCountPoints,
// BoardPoints), so "answered * POINTS_CORRECT" (the quiz's flat correct value) stopped
// being a correct potential for every game the moment match (BoardPoints) shipped. This
// is TypeScript, not SQL, because BoardPoints' potential needs both an item count
// (answered pairs) and a board count (completed boards, for the per-board perfectBonus) —
// expressible in SQL but not as one flat multiply, and the registry (the single source of
// truth for points) lives in TS, not the DB.
//
// `gameId === 'unknown'` is the legacy pre-db/004 bucket (game_type was added in
// db/004_add_event_metrics.sql; rows written before that have game_type = null and are
// coalesced to 'unknown' in the query in app/api/stats/route.ts). Every row in that bucket
// predates match's existence, so it is always quiz-shaped — preserved as
// answered * POINTS_CORRECT, exactly what this function replaces for every other bucket.

import { getGame } from './registry.ts'
import { POINTS_CORRECT } from '../game/engine.ts'

export function potentialForGame(gameId: string, answered: number, boards: number): number {
  if (gameId === 'unknown') {
    return answered * POINTS_CORRECT
  }
  let entry
  try {
    entry = getGame(gameId)
  } catch {
    // A game_type in the data that isn't in the registry (renamed/removed game id).
    // Don't let one bad bucket blow up the whole stats query -- just contribute 0.
    return 0
  }
  switch (entry.points.kind) {
    case 'flat':
      return answered * entry.points.correct
    case 'board':
      // answered pairs at perPair, plus one perfectBonus per board actually
      // completed -- the max payout if every attempted pair and every played
      // board had gone perfectly.
      return answered * entry.points.perPair + boards * entry.points.perfectBonus
    case 'guessCount':
      // PLACEHOLDER best case, not exercised against real play: Wordle
      // (`entry.points.kind === 'guessCount'`) is `enabled: false` in the registry, so no
      // guessCount row exists in production data yet. Math.max(...byGuessCount) assumes
      // every attempt solved in the best-paying guess count -- if Wordle ships (WP A4),
      // revisit whether that's still the right "potential" definition before trusting it.
      return answered * Math.max(...entry.points.byGuessCount)
    case 'partition':
      // Connections logs per-guess facility as guess_submitted, not
      // question_answered (docs/NEXT_SESSION_BUILD_BRIEF.md §7) -- so
      // `answered` is always 0 for this game_id and `boards` (board_complete
      // count) is the only real signal. Best case per board actually played:
      // all 4 groups solved with zero mistakes.
      return boards * (4 * entry.points.perGroup + entry.points.perfectBonus)
    default: {
      const exhaustive: never = entry.points
      throw new Error(`unhandled points kind: ${JSON.stringify(exhaustive)}`)
    }
  }
}
