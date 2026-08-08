// Package A6, time-lever slice, HIGH 2 fix (8 Aug 2026 adversarial review):
// closes the "re-GET resets the clock and the check budget" exploit found in
// both independent reviews of the time-lever diff.
//
// THE BUG: app/api/crossword/board/route.ts's GET writes a FRESH
// `board_served` row (with a brand-new nonce) every time it is called, and
// with one live board `selectCrosswordBoard` keeps returning that same board.
// The old submit/route.ts scored `serverElapsedMs` and `checksUsed` purely
// off the CURRENT token's own nonce -- so a student could GET, solve offline
// for 20 minutes, GET again (which also supersedes the first token via the
// existing board_token_issued/isTokenCurrent check, so the student MUST
// submit with the fresh nonce), and submit: the server would see a ~2-second
// elapsed and a brand-new, unspent check budget, even though the actual grid
// was solved over 20 minutes with the first budget already exhausted.
//
// THE FIX, in two layers, same pure/glue split as crossword.ts/crossword-
// lever.ts: `resolveServeAnchor`/`checksSpentSinceAnchor` below are pure,
// DB-free, and unit-tested directly on plain numbers; `resolveCrosswordServeAnchor`
// is the DB-touching glue app/api/crossword/submit/route.ts actually calls,
// which fetches candidate rows (elapsed times computed server-side inside
// Postgres, never via this app server's own clock -- same "no clock skew"
// posture as the original serverElapsedMs lookup it replaces) and folds them
// through the pure functions.
//
// Node's native TS test runner doesn't resolve the "@/*" tsconfig alias the
// route files use, so this stays plain relative imports, same as
// crossword-lever.ts.

import type { NeonQueryFunction } from '@neondatabase/serverless'

type Sql = NeonQueryFunction<false, false>

/** One candidate `board_served` row for a (student, board) pair, as seen
 *  from "now": `elapsedMs` is `now() - created_at`, computed SERVER-SIDE in
 *  Postgres by the caller (never derived from this app server's own clock),
 *  and `completed` is whether this specific nonce already has a matching
 *  `board_complete` row -- a serve whose OWN cycle already scored is never a
 *  valid anchor for a DIFFERENT, currently in-flight completion. */
export interface ServedCandidate {
  nonce: string
  elapsedMs: number
  completed: boolean
}

export interface ServeAnchor {
  nonce: string
  elapsedMs: number
}

/**
 * Pick the anchor `board_served` row for one (student, board) "cycle": the
 * OLDEST un-completed serve that is still within the board token's own TTL
 * of "now" (`ttlMs`). This is deliberately the EARLIEST eligible row, not the
 * latest -- a re-GET always mints a new nonce/token, but the scored elapsed
 * time must reflect when the student was FIRST handed this board, not
 * whichever GET happens to be freshest at submit time (that is exactly the
 * exploit this module exists to close).
 *
 * Bounding to `ttlMs` is what keeps a genuine, long-abandoned attempt from
 * permanently pinning a tight window: a serve older than the TTL is treated
 * as expired (its own board token would no longer even pass
 * `readBoardToken`'s TTL check), so it drops out of eligibility and a later,
 * genuinely-fresh serve anchors normally -- a student who takes a real break
 * and comes back is scored on their new attempt, never locked out (package
 * A1's 8-board lockout is the standing cautionary example for this class of
 * bug).
 *
 * Returns null when there is no eligible candidate at all -- structurally
 * "should not happen" for a legitimately-issued, unexpired token (GET always
 * inserts a `board_served` row alongside the token it issues, see
 * board/route.ts), so callers treat null as a hard failure, not a fallback.
 */
export function resolveServeAnchor(ttlMs: number, served: readonly ServedCandidate[]): ServeAnchor | null {
  const eligible = served.filter((r) => !r.completed && r.elapsedMs <= ttlMs)
  if (eligible.length === 0) return null
  // The OLDEST serve has the LARGEST elapsed-since-now.
  const anchor = eligible.reduce((oldest, r) => (r.elapsedMs > oldest.elapsedMs ? r : oldest))
  return { nonce: anchor.nonce, elapsedMs: anchor.elapsedMs }
}

/**
 * How many `check_spent` events actually belong to the anchored cycle: every
 * check whose own elapsed-since-now is SHORTER than the anchor's (i.e. it
 * happened at or after the anchor's serve, whether under the anchor's own
 * nonce or a later refreshed one) counts against the ONE shared budget for
 * this cycle -- checks spent under an earlier, since-refreshed nonce must
 * not reset to a free budget just because the token was re-issued.
 */
export function checksSpentSinceAnchor(anchorElapsedMs: number, checkSpentElapsedMs: readonly number[]): number {
  return checkSpentElapsedMs.filter((e) => e <= anchorElapsedMs).length
}

type ServedRow = { nonce: string | null; elapsed_ms: number | string | null; completed: boolean | null }
type CheckRow = { elapsed_ms: number | string | null }

function toElapsedMs(raw: number | string | null): number | null {
  if (raw === null) return null
  return Math.max(0, Math.round(Number(raw)))
}

/**
 * DB-touching glue: resolves the anchor `board_served` row and the checks
 * spent within that same cycle for one (student, board) pair, in two bounded,
 * indexed (db/016) queries. Returns null on any lookup failure OR a genuine
 * missing anchor (see `resolveServeAnchor`'s docstring) -- callers must fail
 * CLOSED (500) on null, never fabricate a checksUsed/elapsed value, because
 * both numbers are load-bearing for scoring (checkBonus, timeBonus) and for
 * the check-budget gate itself.
 */
export async function resolveCrosswordServeAnchor(
  sql: Sql,
  studentId: string,
  boardId: string,
  ttlSeconds: number
): Promise<(ServeAnchor & { checksUsed: number }) | null> {
  let servedRows: ServedRow[]
  try {
    servedRows = (await sql`
      select
        bs.question_id as nonce,
        extract(epoch from (now() - bs.created_at)) * 1000 as elapsed_ms,
        exists (
          select 1 from events bc
          where bc.event_type = 'board_complete' and bc.question_id = bs.question_id
        ) as completed
      from events bs
      where bs.event_type = 'board_served'
        and bs.game_type = 'crossword'
        and bs.student_id = ${studentId}
        and bs.board_id = ${boardId}
        and bs.created_at >= now() - make_interval(secs => ${ttlSeconds})
    `) as ServedRow[]
  } catch (err) {
    console.error('crossword-serve-anchor: board_served lookup failed', err)
    return null
  }

  const candidates: ServedCandidate[] = servedRows
    .filter((r) => r.nonce !== null && r.elapsed_ms !== null && r.completed !== null)
    .map((r) => ({ nonce: r.nonce as string, elapsedMs: toElapsedMs(r.elapsed_ms)!, completed: r.completed as boolean }))

  const anchor = resolveServeAnchor(ttlSeconds * 1000, candidates)
  if (!anchor) return null

  let checkRows: CheckRow[]
  try {
    checkRows = (await sql`
      select extract(epoch from (now() - created_at)) * 1000 as elapsed_ms
      from events
      where event_type = 'check_spent'
        and game_type = 'crossword'
        and student_id = ${studentId}
        and board_id = ${boardId}
        and created_at >= now() - make_interval(secs => ${ttlSeconds})
    `) as CheckRow[]
  } catch (err) {
    console.error('crossword-serve-anchor: check_spent lookup failed', err)
    return null
  }

  const checkElapsed = checkRows.map((r) => toElapsedMs(r.elapsed_ms)).filter((e): e is number => e !== null)
  const checksUsed = checksSpentSinceAnchor(anchor.elapsedMs, checkElapsed)

  return { nonce: anchor.nonce, elapsedMs: anchor.elapsedMs, checksUsed }
}
