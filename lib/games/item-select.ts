// Package A3: the least-recently-served + difficulty-tiebreak ranking
// lib/games/match-board-select.ts built for match-the-following (see that
// file's header for the full history of why hard exclusion doesn't work at
// this pool size), generalised here so choose-the-right-word
// (app/api/word/question/route.ts) can reuse the exact same ranking instead
// of a second hand-copied version. Pure and DB-free, same reason as before:
// node's native TS test runner doesn't resolve the "@/*" tsconfig alias, so
// anything meant to be driven by tests/*.test.ts has to live behind a plain
// relative import.
//
// What's generalised and what isn't: the RANKING (never-served first, then
// oldest-served, difficulty distance as a tiebreak only when enough
// calibrated rows exist) is subject-agnostic and lives here. Match's
// subject-grouping rule (FIX 8: a board never spans two subjects) is NOT
// folded in -- choose-the-right-word has no subject concept in its contract
// (GET /api/word/question takes no subject param) -- it stays a thin wrapper
// in match-board-select.ts that groups by subject, picks one, and hands that
// subject's rows to selectItems below.

/** The minimum shape selectItems needs from a row: an id to key `lastSeen`
 *  on, and a difficulty (null when uncalibrated). Callers' real row types
 *  (EligibleRow for match, the term-item row for choose-the-right-word)
 *  carry more fields than this -- TypeScript's structural typing means
 *  neither has to explicitly `extends` it, though EligibleRow does for
 *  clarity. */
export interface RankableRow {
  id: string
  difficulty: number | null
}

export interface RankedSelection<T> {
  rows: T[]
  difficultyHonored: boolean
}

/** Fisher-Yates, with an injectable RNG so tests are deterministic. Moved
 *  here from lib/games/match-board-select.ts so both callers share one copy;
 *  that file re-exports it so nothing importing it from there (including
 *  tests/match-board.test.ts) has to change. */
export function shuffle<T>(items: readonly T[], randomFn: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Rank `candidates` by least-recently-served (never-served first, then
 * oldest-served), with difficulty distance to `targetDifficulty` as a
 * SECONDARY key -- only applied when at least `count` candidates are
 * calibrated (non-null `difficulty`) AND at least `minCalibrated` are
 * (FIX 3) -- otherwise recency is the sole key. The second condition exists
 * because `count` alone is not a meaningful bar for a caller that asks for
 * one item at a time (choose-the-right-word, count=1): the moment a single
 * row anywhere in content_items gets calibrated, `calibrated.length >= 1` is
 * vacuously true and that one row becomes "the whole difficulty-ranked pool"
 * for every student. `minCalibrated` lets a caller require a real sample
 * regardless of how small `count` is; it defaults to 0 so callers that
 * already size `count` meaningfully (match's board-sized count) are
 * unaffected. Never claims a difficulty preference the selection didn't
 * actually honour (the same rule match's FIX 7 encoded). Returns the `count`
 * best-ranked rows, shuffled for serving order, or null when fewer than
 * `count` candidates exist at all -- the caller's cue for a 409, never for a
 * student who has simply seen a lot of the pool; recency only reorders, it
 * never excludes.
 */
export function selectItems<T extends RankableRow>(
  candidates: readonly T[],
  lastSeen: ReadonlyMap<string, number>,
  targetDifficulty: number | null,
  count: number,
  randomFn: () => number = Math.random,
  minCalibrated = 0
): RankedSelection<T> | null {
  if (candidates.length < count) return null

  // Never-served items rank as far in the past as this finite sentinel, so
  // they always sort ahead of anything with a real (positive, epoch-ms)
  // lastSeen timestamp. FIX 4: this used to be -Infinity, which made the
  // difficulty tiebreak below dead on arrival -- comparing two never-served
  // rows computed `-Infinity - -Infinity === NaN`, and a NaN comparator
  // result never reaches the difficulty branch, so sort() left never-served
  // rows in raw DB order no matter how far apart their difficulty was from
  // the target. -1 is a safe finite floor because every real lastSeen value
  // is a positive epoch-ms timestamp.
  const NEVER_SERVED = -1
  const recencyKey = (r: T) => lastSeen.get(r.id) ?? NEVER_SERVED

  let pool: readonly T[] = candidates
  let difficultyHonored = false
  if (targetDifficulty !== null) {
    const calibrated = candidates.filter((r) => r.difficulty !== null)
    if (calibrated.length >= count && calibrated.length >= minCalibrated) {
      pool = calibrated
      difficultyHonored = true
    }
  }

  const ranked = [...pool].sort((a, b) => {
    const recencyDiff = recencyKey(a) - recencyKey(b)
    if (recencyDiff !== 0) return recencyDiff
    if (!difficultyHonored) return 0
    return (
      Math.abs((a.difficulty as number) - (targetDifficulty as number)) -
      Math.abs((b.difficulty as number) - (targetDifficulty as number))
    )
  })

  // `pool` always has >= count rows here: either `candidates` itself
  // (already checked above) or the calibrated subset (only used when it
  // itself has >= count rows) -- so this slice can never come up short.
  return { rows: shuffle(ranked.slice(0, count), randomFn), difficultyHonored }
}

/** Defensive parse of a `difficultyHonored` field pulled out of a JSON
 *  response: only an actual boolean `true` counts as honoured -- a missing
 *  field, a non-boolean value, or an explicit `false` must all read as "the
 *  Level N badge stays hidden," never a client-side guess. Word's page wrote
 *  this inline before this export existed; match's page (and any future
 *  caller) uses this shared version instead so the same default can't drift
 *  between games -- the exact seam (a value computed on the server, mis- or
 *  un-handled on the client) that shipped the A3 badge bug this fixes.
 */
export function parseDifficultyHonored(value: unknown): boolean {
  return value === true
}
