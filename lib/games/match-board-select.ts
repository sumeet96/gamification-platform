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

/** One eligible term_definition row, as the route already has it after its
 *  content_items query -- deliberately NOT the DB row shape (no source_id,
 *  cognitive_level, etc.), just what selection needs. */
export interface EligibleRow {
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

/** Fisher-Yates, with an injectable RNG so tests are deterministic. */
export function shuffle<T>(items: readonly T[], randomFn: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
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
 *  - Least-recently-served ranking (replaces the old hard exclusion, see
 *    app/api/match/board/route.ts's header for why hard exclusion doesn't
 *    work at this pool size): `lastSeen` maps item id -> the ms-epoch this
 *    student last answered it, absent for never-served items. Within the
 *    chosen subject, never-served rows sort first (they rank as
 *    "infinitely long ago"), then served rows oldest-first -- so repeats are
 *    pushed as far into the future as the pool allows but a fully-saturated
 *    student still gets a full board instead of a 409.
 *  - FIX 7: difficulty is a SECONDARY key, only applied when the subject has
 *    at least `boardSize` calibrated (non-null `difficulty`) rows -- draws
 *    from that calibrated subset and breaks recency ties by distance to
 *    `targetDifficulty`. ALL term_definition rows are NULL today (the
 *    existing difficulty simulator is MCQ-only), so this always falls back
 *    to the uncalibrated path for now -- that fallback is not a bug, it's
 *    FIX 7's whole point: never claim a difficulty the board didn't actually
 *    honour. `difficultyHonored` tells the caller which happened, so it can
 *    be carried into the board token and the event log stays honest.
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

  // Never-served items rank as "infinitely long ago" (-Infinity) so they
  // always sort ahead of anything with a real lastSeen timestamp.
  const recencyKey = (r: EligibleRow) => lastSeen.get(r.id) ?? -Infinity

  let candidates = subjectRows
  let difficultyHonored = false
  if (targetDifficulty !== null) {
    const calibrated = subjectRows.filter((r) => r.difficulty !== null)
    if (calibrated.length >= boardSize) {
      candidates = calibrated
      difficultyHonored = true
    }
  }
  // candidates is always >= boardSize: either the full subjectRows (which
  // subjectsWithEnough already guaranteed) or the calibrated subset (only
  // used when it itself has >= boardSize rows) -- so the slice below can
  // never come up short and this function can never return null once a
  // subject has been chosen.

  // Primary key: recency (never-served, then oldest-served). Secondary key:
  // distance to targetDifficulty, but ONLY when difficulty is honoured --
  // otherwise recency is the sole key and ties keep their original (already
  // subject-scoped, unordered) relative position. In practice this means a
  // fresh student's never-served items (all tied at -Infinity) get ranked by
  // difficulty exactly as before; as a student accumulates history, distinct
  // real timestamps increasingly take over from difficulty.
  const ranked = [...candidates].sort((a, b) => {
    const recencyDiff = recencyKey(a) - recencyKey(b)
    if (recencyDiff !== 0) return recencyDiff
    if (!difficultyHonored) return 0
    return (
      Math.abs((a.difficulty as number) - (targetDifficulty as number)) -
      Math.abs((b.difficulty as number) - (targetDifficulty as number))
    )
  })

  // Rank picks the boardSize least-recently-served (and, secondarily,
  // closest-difficulty) candidates FIRST, then shuffles only that slice for
  // serving order -- shuffling before slicing would throw the ranking away.
  return { subject, rows: shuffle(ranked.slice(0, boardSize), randomFn), difficultyHonored }
}
