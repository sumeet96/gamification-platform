import { NeonDbError } from '@neondatabase/serverless'
import { getSql } from '@/lib/db/client'
import { getCurrentStudent } from '@/lib/auth/current-student'
import { readBoardToken, isTokenCurrent, BOARD_TOKEN_ISSUED_EVENT_TYPE } from '@/lib/auth/board-token'
import { getGame } from '@/lib/games/registry'
import { BOARD_SIZE, boardSucceeded, scoreBoard, type BoardPair } from '@/lib/games/match'

// POST /api/match/submit -- scores one match-the-following board (package A1).
// Mirrors app/api/answer/route.ts closely: server-side scoring off the DB
// answer key, cookie-only student attribution, a client/cookie mismatch
// guard, a duplicate-commit check, and an FK-violation retry with a null
// student_id. The one thing that differs is that this route writes MULTIPLE
// events per commit (one question_answered per pair, plus one board_complete)
// instead of one -- see the insert loop below.
//
// Never trusts term strings from the client as the key -- `submission` is
// only the student's placements; the six items are re-read from
// content_items by id to get the real term/variants before scoring.
//
// FIX 1: every submission must carry a `board_token` issued by GET
// /api/match/board (lib/auth/board-token.ts) for THIS student, covering
// EXACTLY the item ids being submitted. That closes the exploit where a
// client reads the six terms out of one board response and replays them
// against fabricated boards_completed values, or farms a board it never
// actually fetched.
//
// Second adversarial pass (review-2), all against this file's uncommitted
// code:
//   review-2 FIX 1: the board_complete dedupe was a plain SELECT-then-INSERT,
//     non-atomic on the Neon HTTP driver (no transaction) -- N parallel POSTs
//     with the same valid token all passed the SELECT before any INSERT
//     landed. The INSERT is now the lock: `on conflict (question_id) where
//     event_type = 'board_complete' do nothing returning id` against the
//     partial unique index db/007_add_board_dedupe.sql adds
//     (events_board_nonce_uidx). See insertBoardCompleteAtomic below.
//   review-2 FIX 2: a token whose nonce is not the MOST RECENT
//     BOARD_TOKEN_ISSUED_EVENT_TYPE marker for this (student, session) is
//     rejected as superseded -- see the check right after session_id below.
//     Closes the token-harvesting exploit at the redemption side (the issue
//     side is app/api/match/board/route.ts).
//   review-2 FIX 4: `pair.submitted` (the term string the student actually
//     placed) is now written to the new `submitted_text` column on each
//     per-pair row, instead of only recording right/wrong.

/** Insert with the same FK-violation retry app/api/answer/route.ts uses: a
 *  stale session cookie pointing at a students row that's gone (branch reset,
 *  re-seed) fails the FK on student_id. Retrying once with null keeps the row
 *  (and the research dataset) instead of silently losing it.
 *
 *  Returns whether the row ended up written at all (original insert OR the
 *  null-student retry succeeded) -- FIX 2 needs this: the board's answer key
 *  may only be revealed once board_complete is CONFIRMED written, not just
 *  attempted. */
async function insertWithFkRetry(
  insert: (studentId: string | null) => Promise<unknown>,
  studentId: string | null,
  label: string
): Promise<boolean> {
  try {
    await insert(studentId)
    return true
  } catch (err) {
    if (err instanceof NeonDbError && err.code === '23503') {
      console.error(`match/submit: student_id fk violation on ${label}, retrying with null student_id`, {
        student_id: studentId,
        message: err.message,
      })
      try {
        await insert(null)
        return true
      } catch (retryErr) {
        console.error(`match/submit: retry insert with null student_id also failed (${label})`, retryErr)
        return false
      }
    } else {
      console.error(`match/submit: ${label} insert failed`, err)
      return false
    }
  }
}

type BoardCompleteOutcome = 'inserted' | 'conflict' | 'error'

/** review-2 FIX 1: the OLD dedupe was a plain SELECT for an existing
 *  board_complete row by nonce, run before any insert -- on the Neon HTTP
 *  driver there is no transaction wrapping the SELECT and the later INSERT,
 *  so N parallel POSTs carrying the same valid board_token all read "not
 *  found" before any of them commits, and all N score. This makes the INSERT
 *  itself the lock: it targets the partial unique index
 *  `events_board_nonce_uidx on events (question_id) where event_type =
 *  'board_complete'` (db/007_add_board_dedupe.sql) with `on conflict ... do
 *  nothing` -- Postgres, not application code, decides which of N concurrent
 *  inserts wins. `returning id` is how the caller tells "inserted" (a row
 *  came back) apart from "conflict" (on conflict do nothing produced zero
 *  rows) without a second query.
 *
 *  This reverses the meaning of writing board_complete first, without
 *  reversing the write ORDER: it was already written before the per-pair
 *  rows (so a crash between the two never risks a double-scored board), but
 *  it was merely advisory -- a hint the SELECT above trusted. Here it is
 *  authoritative -- the row's mere existence, enforced by the unique index,
 *  IS the dedupe.
 *
 *  Same FK-retry shape as insertWithFkRetry above; an FK violation on either
 *  attempt, or any other error, comes back as 'error' -- never silently
 *  treated as a pass-through to scoring (fail closed). */
async function insertBoardCompleteAtomic(
  insert: (studentId: string | null) => Promise<Array<{ id: unknown }>>,
  studentId: string | null
): Promise<BoardCompleteOutcome> {
  try {
    const rows = await insert(studentId)
    return rows.length > 0 ? 'inserted' : 'conflict'
  } catch (err) {
    if (err instanceof NeonDbError && err.code === '23503') {
      console.error('match/submit: student_id fk violation on board_complete, retrying with null student_id', {
        student_id: studentId,
        message: err.message,
      })
      try {
        const rows = await insert(null)
        return rows.length > 0 ? 'inserted' : 'conflict'
      } catch (retryErr) {
        console.error('match/submit: retry insert with null student_id also failed (board_complete)', retryErr)
        return 'error'
      }
    }
    console.error('match/submit: board_complete insert failed', err)
    return 'error'
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'bad json' }, { status: 400 })
  }

  // `submission` maps itemId -> the term string the student placed on that
  // clue (or null for an unfilled slot). The page always sends all BOARD_SIZE
  // keys, even for unfilled slots, so Object.keys(submission) is the full set
  // of item ids for this board -- matchesTerm/scoreBoard already treat a
  // missing key the same as an explicit null (see tests/match.test.ts).
  const submissionRaw = body.submission
  if (typeof submissionRaw !== 'object' || submissionRaw === null || Array.isArray(submissionRaw)) {
    return Response.json({ ok: false, error: 'missing submission' }, { status: 400 })
  }
  const submission: Record<string, string | null> = {}
  for (const [itemId, value] of Object.entries(submissionRaw as Record<string, unknown>)) {
    if (value !== null && typeof value !== 'string') {
      return Response.json({ ok: false, error: 'invalid submission value' }, { status: 400 })
    }
    submission[itemId] = value
  }
  const itemIds = Object.keys(submission)
  if (itemIds.length !== BOARD_SIZE) {
    return Response.json({ ok: false, error: 'submission must cover exactly one board' }, { status: 400 })
  }

  const game = getGame('match')
  if (game.points.kind !== 'board') {
    // Mirrors app/api/answer/route.ts's flat-shape guard: a non-board points
    // shape here is a caller bug, not a scoreable event.
    return Response.json({ ok: false, error: 'unsupported scoring shape for this game' }, { status: 400 })
  }
  const points = game.points

  const sql = getSql()
  if (!sql) return Response.json({ ok: false, error: 'database not configured' }, { status: 500 })

  const student = await getCurrentStudent()
  if (!student) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 })

  // FIX 1: verify the board token before trusting anything else in the body.
  const boardToken = typeof body.board_token === 'string' ? body.board_token : null
  if (!boardToken) return Response.json({ ok: false, error: 'missing board token' }, { status: 400 })
  const tokenPayload = readBoardToken(boardToken)
  if (!tokenPayload) {
    return Response.json({ ok: false, error: 'invalid or expired board token' }, { status: 400 })
  }
  if (tokenPayload.studentId !== student.id) {
    // A token minted for one student redeemed by another -- never a
    // legitimate client bug, log it loudly.
    console.error('match/submit: board token student mismatch', {
      token_student_id: tokenPayload.studentId,
      cookie_student_id: student.id,
    })
    return Response.json({ ok: false, error: 'board token does not belong to this student' }, { status: 400 })
  }
  // The submitted ids must be EXACTLY the ids the token names -- not a subset,
  // not a superset. An id in the body that isn't in the token is rejected
  // outright rather than silently dropped, per FIX 1.
  const sortedSubmitted = [...itemIds].sort()
  const sortedTokenIds = [...tokenPayload.itemIds].sort()
  if (JSON.stringify(sortedSubmitted) !== JSON.stringify(sortedTokenIds)) {
    return Response.json({ ok: false, error: 'submission does not match the issued board' }, { status: 400 })
  }

  // FIX 2: session_id is now required, not merely used-if-present. The old
  // `if (sessionId)` skip let a client omit it entirely, fail the events
  // table's NOT NULL constraint on every insert, have insertWithFkRetry
  // swallow the (non-FK) error, and still get `ok: true` with the full answer
  // key back -- a free, unlogged key dump.
  const sessionId = typeof body.session_id === 'string' ? body.session_id : null
  if (!sessionId) return Response.json({ ok: false, error: 'missing session_id' }, { status: 400 })

  // review-2 FIX 2: reject a token that is no longer the LATEST issued for
  // this (student, session) -- i.e. superseded by a newer GET
  // /api/match/board, whether or not that newer board was ever submitted.
  // Without this, holding N unredeemed-but-still-validly-signed tokens from N
  // GETs was exactly the harvesting exploit board/route.ts's marker write
  // closes at issue time; this is the redemption-side half of the same fix.
  let latestNonce: string | null = null
  try {
    const latest = (await sql`
      select question_id from events
      where event_type = ${BOARD_TOKEN_ISSUED_EVENT_TYPE}
        and student_id = ${student.id}
        and session_id = ${sessionId}
      order by id desc
      limit 1
    `) as Array<{ question_id: string | null }>
    latestNonce = latest.length > 0 ? latest[0].question_id : null
  } catch (err) {
    // Fail closed: if we cannot confirm this is the current token, do not
    // score it -- unlike the already-served exclusion query, this check is
    // load-bearing for the security property, not a data-quality nicety.
    console.error('match/submit: latest-token lookup failed', err)
    return Response.json({ ok: false, error: 'failed to verify board token' }, { status: 500 })
  }
  if (!isTokenCurrent(latestNonce, tokenPayload.nonce)) {
    // No revealed terms here either -- same contract as the duplicate-commit
    // 409 below: only a commit that is both validly signed AND current gets
    // to see pairs[].term.
    return Response.json({ ok: false, error: 'board token superseded', duplicate: true }, { status: 409 })
  }

  const round = typeof body.round === 'number' ? body.round : null
  // FIX 5: `boards_completed` is the ordinal of the board THIS submission
  // completes (1-indexed) -- the count AS OF this commit, not the count
  // before it. That's the meaning db/004 needs to tell "the lever fired but
  // had no effect" apart from "the lever never fired"; the client (page.tsx)
  // now sends roundTotals.boardsPlayed + 1 to match.
  const boardsCompleted =
    typeof body.boards_completed === 'number' && Number.isInteger(body.boards_completed)
      ? body.boards_completed
      : null
  const timeLimit = typeof body.time_limit === 'number' ? body.time_limit : null

  // Same cross-tab mismatch guard as app/api/answer/route.ts FIX 6: never used
  // as the value written, only ever a signal to downgrade attribution to null.
  let studentIdForInsert: string | null = student.id
  const clientStudentId = typeof body.client_student_id === 'string' ? body.client_student_id : null
  if (clientStudentId && clientStudentId !== student.id) {
    console.error('match/submit: client/cookie student_id mismatch, writing null student_id', {
      cookie_student_id: student.id,
      client_student_id: clientStudentId,
      session_id: sessionId,
    })
    studentIdForInsert = null
  }

  // review-2 FIX 1: the dedupe on the TOKEN'S NONCE now happens atomically at
  // the board_complete INSERT itself (insertBoardCompleteAtomic, below) --
  // see that function's comment for why the old check-then-insert SELECT that
  // used to live here was a race. `events.question_id` is a legacy free-text
  // column app/api/answer/route.ts already reuses as a marker (it writes
  // 'seed-fallback' there); board_complete rows reuse the same column to
  // carry the nonce, which is random and effectively unique on its own, so no
  // additional scoping by session/round is needed for the dedupe.

  // The answer key, looked up server-side only -- and by the TOKEN's item
  // ids, not the client's submission keys (they're already verified equal,
  // but this keeps "scores only what the token named" literally true even if
  // that check above is ever weakened by a future edit).
  let rows: Array<{ id: string; term: string; clue: string; variants: string[] }>
  try {
    rows = (await sql`
      select id, term, clue, variants
      from content_items
      where kind = 'term_definition' and id = any(${tokenPayload.itemIds})
    `) as Array<{ id: string; term: string; clue: string; variants: string[] }>
  } catch (err) {
    console.error('match/submit: content_items lookup failed', err)
    return Response.json({ ok: false, error: 'lookup failed' }, { status: 500 })
  }
  if (rows.length !== tokenPayload.itemIds.length) {
    return Response.json({ ok: false, error: 'unknown item id' }, { status: 404 })
  }

  const pairs: BoardPair[] = rows.map((r) => ({
    itemId: r.id,
    clue: r.clue,
    term: r.term,
    variants: Array.isArray(r.variants) ? r.variants : [],
  }))
  const scored = scoreBoard(pairs, submission, points)

  const mode = typeof body.mode === 'string' ? body.mode : null
  const lever = typeof body.lever === 'string' ? body.lever : null
  // FIX 7: only log a difficulty_level when the board actually honoured one
  // (tokenPayload.difficultyHonored, decided server-side at issue time off
  // real calibration data) -- otherwise this would assert a difficulty the
  // served items never carried. Known open gap: term-item calibration
  // doesn't exist yet, so this is null for every match board today.
  const requestedDifficultyLevel = typeof body.difficulty_level === 'number' ? body.difficulty_level : null
  const difficultyLevel = tokenPayload.difficultyHonored ? requestedDifficultyLevel : null
  const timeTakenMs = typeof body.time_taken_ms === 'number' ? body.time_taken_ms : null
  const netBefore = typeof body.round_net_before === 'number' ? body.round_net_before : 0
  const netAfter = netBefore + scored.net

  // board_complete first: it is the row the dedupe is keyed on (by nonce), so
  // it acts as the commit marker. Written before the six per-pair rows so a
  // crash between the two never risks a double-scored board on retry --
  // worst case is a missing diagnostic pair row, not inflated points (there
  // are no transactions available on this driver; see the per-insert FK
  // retry instead, matching the rest of the codebase). review-2 FIX 1: this
  // insert is now the dedupe lock itself, not merely a write the earlier
  // SELECT trusted -- see insertBoardCompleteAtomic above for why, and why
  // that reverses the old check-then-insert's meaning without reversing its
  // order.
  const insertBoardComplete = (studentId: string | null) =>
    sql`
      insert into events
        (session_id, student_id, event_type, game_type, mode, lever, round, question_id,
         adapt_granularity, boards_completed, difficulty_level, time_limit, time_taken_ms,
         is_correct, points_delta, negative_applied, net_after)
      values
        (${sessionId}, ${studentId}, 'board_complete', 'match', ${mode}, ${lever}, ${round}, ${tokenPayload.nonce},
         'board', ${boardsCompleted}, ${difficultyLevel}, ${timeLimit}, ${timeTakenMs},
         ${boardSucceeded(scored.correctCount, scored.total)}, ${scored.bonus + scored.floor},
         ${scored.floor !== 0}, ${netAfter})
      on conflict (question_id) where event_type = 'board_complete' do nothing
      returning id
    ` as unknown as Promise<Array<{ id: unknown }>>
  const boardCompleteOutcome = await insertBoardCompleteAtomic(insertBoardComplete, studentIdForInsert)

  // FIX 2 (original): the board's key is replay-valuable in a way one MCQ's
  // correctIndex is not -- app/api/answer/route.ts deliberately still returns
  // its result even when logging fails (a single-item trade-off that's
  // acceptable there); a whole board's answer key is not. Do not "fix" this
  // back to match answer/route.ts -- the stakes are different.
  if (boardCompleteOutcome === 'conflict') {
    // review-2 FIX 1: this nonce was already redeemed -- either a genuine
    // repeat submit (double-click, retry) or the losing side of a race that
    // used to score N times. No revealed terms on a repeat.
    return Response.json({ ok: false, error: 'already answered', duplicate: true }, { status: 409 })
  }
  if (boardCompleteOutcome === 'error') {
    // review-2 FIX 1: fail closed -- a dedupe/insert ERROR (as opposed to a
    // conflict) must never fall through to scoring or reveal pairs[].term.
    return Response.json({ ok: false, error: 'failed to record board completion' }, { status: 500 })
  }

  // One question_answered row per pair -- this is what gets per-pair facility
  // into the research dataset even though points are paid out board-grained.
  // points_delta here is the accrual portion only (perPair or 0); the
  // clean-board bonus and floor penalty live on the board_complete row above,
  // not duplicated here. review-2 FIX 4: `submitted_text` carries the actual
  // term string the student placed on this clue (pair.submitted) -- the
  // misconception signal ("which wrong term did they choose") that hard-coding
  // `selected_option = null` on every row was discarding. `selected_option`
  // stays null: it is an int column for MCQ option indices and a term string
  // does not belong there.
  for (const pair of scored.pairs) {
    const insertPairEvent = (studentId: string | null) => sql`
      insert into events
        (session_id, student_id, event_type, game_type, mode, lever, round,
         content_item_id, selected_option, submitted_text, adapt_granularity, boards_completed,
         difficulty_level, is_correct, points_delta)
      values
        (${sessionId}, ${studentId}, 'question_answered', 'match', ${mode}, ${lever}, ${round},
         ${pair.itemId}, ${null}, ${pair.submitted}, 'board', ${boardsCompleted},
         ${difficultyLevel}, ${pair.correct}, ${pair.correct ? points.perPair : 0})
    `
    await insertWithFkRetry(insertPairEvent, studentIdForInsert, `pair ${pair.itemId}`)
  }

  // Revealing the key here is correct and intended: the board has just been
  // scored, deduped, AND confirmed logged -- same contract as correctIndex on
  // the one scoring POST in app/api/answer/route.ts, tightened with the
  // logging-confirmed gate above.
  return Response.json({ ok: true, ...scored })
}
