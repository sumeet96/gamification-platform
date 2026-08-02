import { getSql } from '@/lib/db/client'
import { getCurrentStudent } from '@/lib/auth/current-student'
import { issueBoardToken, readBoardToken, BOARD_TOKEN_ISSUED_EVENT_TYPE } from '@/lib/auth/board-token'
import { BOARD_SIZE } from '@/lib/games/match'
import { selectBoard, shuffle, type EligibleRow } from '@/lib/games/match-board-select'

// GET /api/match/board -- serves one match-the-following board (package A1).
//
// THE ANSWER KEY MUST NEVER REACH THE CLIENT: the response carries clue ids +
// clue text, and a bare list of the six correct term strings shuffled
// independently of clue order. There is deliberately no id on a term and no
// clue-order alignment -- nothing in this payload lets the browser recover
// which term answers which clue. Scoring happens server-side in
// app/api/match/submit/route.ts, off the same content_items row this route
// reads, never off anything echoed back by the client.
//
// The board is a BIJECTION (lib/games/match.ts): six clues, six terms, no
// distractors padded in -- scoreBoard's permutation math depends on that.
//
// FIX 1 (A1 rework): the response also carries a server-signed `boardToken`
// (lib/auth/board-token.ts) binding this exact set of item ids to this
// student. /api/match/submit will not score anything that doesn't match a
// valid, unexpired token -- that's what stops "read the terms out of one
// response, replay boards_completed 1,2,3..." and repeated GET polling from
// being exploitable.
//
// The subject/recency/difficulty selection logic (FIX 7 / FIX 8 /
// least-recently-served ranking) lives in lib/games/match-board-select.ts,
// not here -- it's pure and DB-free
// so tests/match-board.test.ts can drive it with fixtures instead of a live
// Neon connection (node's native TS test runner doesn't resolve the "@/*"
// alias this route file uses, so testable logic has to live somewhere a
// plain relative import can reach).
//
// Already-served handling has gone through two designs, both wrong, before
// this one:
//   review-2 FIX 3 (client-scoped exclusion, wrong): the already-served
//   exclusion set used to be scoped by the CLIENT-supplied `session_id` +
//   `round` query params -- `GET ?round=999`, or omitting `round` altogether,
//   produced an empty set and re-served items whose answers had already been
//   revealed. Free points. Fixed by keying exclusion on the AUTHENTICATED
//   student (from the session cookie, via getCurrentStudent()) instead of
//   anything in the query string.
//   Live-tested 1 Aug 2026 (whole-history exclusion, also wrong): scoping
//   that same exclusion to the student's WHOLE history with match -- any
//   session, any round -- is a hard exclusion, and this pool is small (32
//   International Management + 18 Digital Transformation term_definition
//   rows, single-subject boards of 6). A fresh student can play exactly 8
//   boards (5 + 3) before every subject drops below BOARD_SIZE eligible
//   items and every future GET, forever, 409s. That manufactures the exact
//   engagement ceiling the "keep going -> next round" persistence loop
//   (CLAUDE.md) exists to let a student choose for themselves, and the
//   round_offer event exists to measure -- a hard-stopped game can't produce
//   a voluntary-decline data point.
// Fixed now: exclusion is replaced with LEAST-RECENTLY-SERVED RANKING. The
// student is always served the BOARD_SIZE items they've seen least recently
// (never-served ranks ahead of anything served), so repeats are pushed as
// far into the future as the pool allows but never made impossible. Still
// keyed on the AUTHENTICATED student only, never the query string -- that
// half of the FIX 3 lesson still holds. See the lastSeen query below and
// lib/games/match-board-select.ts's selectBoard for the ranking itself.
//
// review-2 FIX 2 (one live token per student+session): every GET used to mint
// an independently redeemable token with no cap on how many were outstanding
// -- harvest ~100 boards without ever submitting (so the already-served
// exclusion never engages), intersect the shuffled term bags across
// responses to recover the clue->term map, then redeem all ~100 held tokens
// as perfect boards. Fix: each issued token is recorded as a
// `BOARD_TOKEN_ISSUED_EVENT_TYPE` marker row (session_id, student_id,
// question_id = nonce) written directly to `events` below -- a server-only
// write, not through /api/events (which only accepts the client-emittable
// types in lib/log/logEvent.ts). app/api/match/submit/route.ts rejects a
// token whose nonce is not the MOST RECENT marker for that (student,
// session): issuing board N+1 supersedes board N's redeemability, whether or
// not board N was ever submitted. A student who abandons a board and starts
// another simply loses the old one -- that is correct behaviour, not a bug;
// do not "fix" it to keep multiple boards alive.

export async function GET(req: Request) {
  const student = await getCurrentStudent()
  if (!student) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const difficultyParam = searchParams.get('difficulty')
  // Only an integer 1-5 counts as a preference; anything else (missing, out of
  // range, non-numeric) means "no preference" rather than a guessed default.
  const targetDifficulty =
    difficultyParam !== null && /^[1-5]$/.test(difficultyParam) ? Number(difficultyParam) : null

  // review-2 FIX 2: session_id is now required, not merely used-if-present --
  // it is the scoping key for the one-live-token marker below, not just
  // informational the way it used to be for the (now removed) round-scoped
  // exclusion query.
  const sessionId = searchParams.get('session_id')
  if (!sessionId) return Response.json({ ok: false, error: 'missing session_id' }, { status: 400 })

  const sql = getSql()
  if (!sql) {
    // No DB means zero eligible term_definition rows, not a different failure
    // mode -- there is no seed bank for this primitive the way the quiz has one.
    console.warn('match/board: database not configured, cannot serve a board')
    return Response.json({ ok: false, error: 'not enough term items' }, { status: 409 })
  }

  // `retired_at is null` (db/009_add_item_retirement.sql) excludes soft-
  // withdrawn items -- e.g. chart-caption rows that are not real
  // term/definition pairs. The row is never deleted (events may already
  // reference it), it just stops being eligible for a new board.
  let allRows: EligibleRow[]
  try {
    allRows = (await sql`
      select id, term, clue, subject, difficulty
      from content_items
      where kind = 'term_definition'
        and term is not null and trim(term) <> ''
        and clue is not null and trim(clue) <> ''
        and retired_at is null
    `) as EligibleRow[]
  } catch (err) {
    console.error('match/board: content_items query failed', err)
    return Response.json({ ok: false, error: 'not enough term items' }, { status: 409 })
  }

  // Least-recently-served ranking (see header): keyed on the AUTHENTICATED
  // student only, scoped to their whole history with match (any session, any
  // round) -- but unlike the old exclusion query, this is a PREFERENCE input
  // to selectBoard, not a filter. Fails open on the lookup itself -- same
  // trade-off as before -- losing the "prefer least-recently-served" property
  // for one board is a data-quality regression, not the security property the
  // token (FIX 1/2) depends on. An empty map just means every item ranks as
  // never-served, which is the correct behaviour for a genuinely new student.
  let lastSeen = new Map<string, number>()
  try {
    const served = (await sql`
      select content_item_id, max(created_at) as last_seen
      from events
      where event_type = 'question_answered'
        and game_type = 'match'
        and student_id = ${student.id}
        and content_item_id is not null
      group by content_item_id
    `) as Array<{ content_item_id: string; last_seen: string | Date }>
    lastSeen = new Map(served.map((r) => [r.content_item_id, new Date(r.last_seen).getTime()]))
  } catch (err) {
    console.error('match/board: last-served lookup failed', err)
  }

  const selection = selectBoard(allRows, lastSeen, targetDifficulty, BOARD_SIZE)
  if (!selection) {
    // Do NOT silently serve a short or mixed-subject board -- scoreBoard's
    // permutation math (lib/games/match.ts) assumes exactly BOARD_SIZE pairs
    // from one subject. This is now ONLY possible when a subject genuinely
    // has fewer than BOARD_SIZE term_definition rows in total -- selectBoard
    // never returns null on account of a student's history, however
    // saturated (see lib/games/match-board-select.ts).
    console.warn('match/board: no subject has enough eligible term_definition items', {
      knownHistory: lastSeen.size,
      needed: BOARD_SIZE,
    })
    return Response.json({ ok: false, error: 'not enough term items' }, { status: 409 })
  }

  const clues = selection.rows.map((r) => ({ itemId: r.id, clue: r.clue }))
  // Shuffled independently of `clues` order -- a bare string array with no id,
  // so there is no positional or keyed way to recover the clue -> term mapping.
  const terms = shuffle(selection.rows.map((r) => r.term))

  const boardToken = issueBoardToken(
    selection.rows.map((r) => r.id),
    student.id,
    selection.difficultyHonored
  )

  // review-2 FIX 2: record this token's nonce as the new live marker for
  // (student, session) BEFORE handing the token back. `issueBoardToken`
  // doesn't return the raw nonce, so it's recovered by verifying the token we
  // just signed -- cheap, and keeps issueBoardToken's signature (and its
  // existing tests) untouched. If either step fails we must not serve a token
  // that submit could never recognise as "the latest": fail the whole request
  // rather than silently hand out an orphaned, unenforceable token.
  const nonce = readBoardToken(boardToken)?.nonce
  if (!nonce) {
    console.error('match/board: freshly issued token failed to decode, refusing to serve it')
    return Response.json({ ok: false, error: 'failed to issue board' }, { status: 500 })
  }
  try {
    await sql`
      insert into events
        (session_id, student_id, event_type, game_type, question_id)
      values
        (${sessionId}, ${student.id}, ${BOARD_TOKEN_ISSUED_EVENT_TYPE}, 'match', ${nonce})
    `
  } catch (err) {
    console.error('match/board: failed to record issued-token marker', err)
    return Response.json({ ok: false, error: 'failed to issue board' }, { status: 500 })
  }

  return Response.json({ ok: true, clues, terms, boardToken })
}
