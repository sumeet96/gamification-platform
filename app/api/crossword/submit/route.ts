import { NeonDbError } from '@neondatabase/serverless'
import { getSql } from '@/lib/db/client'
import { getCurrentStudent } from '@/lib/auth/current-student'
import { readBoardToken, isTokenCurrent, BOARD_TOKEN_ISSUED_EVENT_TYPE } from '@/lib/auth/board-token'
import { getGame } from '@/lib/games/registry'
import { attributeStudent, insertAnswerAtomic } from '@/lib/game/answer-commit'
import {
  gradeEntry, gradeBoard, checkBudget, scoreBoard,
  type CrosswordBoard, type Direction, type GridState, type BoardGrading,
} from '@/lib/games/crossword'

// POST /api/crossword/submit -- scores crossword play (package A6).
// Mirrors app/api/connections/submit/route.ts's security shape (board-token
// verification, the latest-nonce supersession check, cookie-only student
// attribution, board reconstruction with a live-itemIds match against the
// token's claim) but, like that route, ONE handler covers TWO operations,
// distinguished by `body.kind`:
//
//   'check'    -- spend one budgeted hint on a single named entry. Fired
//                 repeatedly during a board.
//   'complete' -- the board ends (solved / abandoned). Fired once.
//
// Never trusts a client-supplied score, correct/wrong/not-attempted tally,
// or checks-used count (CLAUDE.md, stated explicitly for this class of
// change): `checksUsed` is always recomputed by COUNTING this board serve's
// own already-committed `check_spent` events, never read from the request
// body, in BOTH handlers. A 'complete' grades the FULL board server-side via
// gradeBoard() against crossword_entries' own answers, never anything the
// client asserts about which entries it filled correctly.
//
// THE ANSWER KEY (crossword_entries.fragment, as CrosswordEntry.answer) is
// reconstructed here from the DB and never leaves this route except inside
// `reveal` on an actual 'complete' response -- see that handler below.
//
// JUDGMENT CALL, stated explicitly per the build plan: repeat-checking the
// SAME entry twice within one board serve still consumes 2 units of the
// check budget. There is no dedupe/idempotency on repeat checks of one
// entry -- this is a stated, deliberate simplification, not an oversight.
//
// ASYMMETRY WITH CONNECTIONS, stated explicitly: `terminal_reason` is NOT
// re-derived server-side the way Connections' is. Connections can derive
// 'budget' objectively from a mistake count; crossword has no equivalent --
// 'solved' just means the student clicked the explicit solve action, and
// there is no server-computable basis to check that against. This is safe
// specifically because no scoring value in GridPoints (lib/games/registry.ts)
// is gated on terminal_reason -- see lib/games/crossword.ts's scoreBoard --
// it is pure telemetry here, never an input to accrual/bonus/checkBonus/net.
// Do not generalise this into "client-claimed terminal_reason is fine
// everywhere" -- Connections' own derivation exists for exactly the opposite
// reason.

/** Same small helper app/api/connections/submit/route.ts keeps locally (see
 *  that file's header on why lib/game/answer-commit.ts's insertAnswerAtomic
 *  isn't reused here): a best-effort insert with one retry under a null
 *  student_id on an FK violation (a stale session cookie pointing at a
 *  students row that's gone). Used only for check_spent below, which has NO
 *  unique index to dedupe against (repeat checks of the same entry are
 *  deliberately allowed to double-spend, per the header above), so it never
 *  needs insertAnswerAtomic's ON CONFLICT ... RETURNING contract. A failed
 *  insert here only risks UNDER-counting checksUsed on the next lookup (one
 *  free check), never over-counting -- the same acceptable-risk shape
 *  connections/submit's group_solved insert already accepts. */
async function insertBestEffort(
  insert: (studentId: string | null) => Promise<unknown>,
  studentId: string | null,
  label: string
): Promise<boolean> {
  try {
    await insert(studentId)
    return true
  } catch (err) {
    if (err instanceof NeonDbError && err.code === '23503') {
      console.error(`crossword/submit: student_id fk violation on ${label}, retrying with null student_id`, {
        student_id: studentId,
        message: err.message,
      })
      try {
        await insert(null)
        return true
      } catch (retryErr) {
        console.error(`crossword/submit: retry insert with null student_id also failed (${label})`, retryErr)
        return false
      }
    }
    console.error(`crossword/submit: ${label} insert failed`, err)
    return false
  }
}

type BoardRow = {
  content_item_id: string
  fragment: string
  x: number
  y: number
  direction: string
  subject: string
}

/** Reassemble the full CrosswordBoard (WITH answers -- server-side only,
 *  never sent back to the client except inside `reveal` on a genuine
 *  'complete') from the flat query result. */
function buildBoard(rows: readonly BoardRow[], boardId: string): CrosswordBoard {
  return {
    boardId,
    subject: rows[0]?.subject ?? '',
    entries: rows.map((r) => ({
      contentItemId: r.content_item_id,
      answer: r.fragment,
      x: r.x,
      y: r.y,
      direction: r.direction as Direction,
    })),
  }
}

/** Defensive parse of the client's cell-keyed fill state -- an object, never
 *  an array, every value a string. Returns null on any malformed shape so
 *  the caller can reject with 400 rather than let a bad value reach
 *  gradeEntry/gradeBoard.
 *
 *  CAUGHT IN REVIEW: an empty-string value is dropped, not stored. A
 *  controlled `<input>`'s natural default value is `''`, not `undefined` --
 *  a page that posts every rendered cell (touched or not) would otherwise
 *  make gradeEntry see every entry as "fully filled" (every cell present in
 *  the map, just empty), so a student who left an entry entirely untouched
 *  would be graded WRONG instead of not_attempted, taking perWrong's
 *  negative marking for never having attempted it at all -- silently
 *  breaking the one design property GridPoints' docstring calls out most
 *  explicitly (0 for not-attempted, strictly better than a wrong guess).
 *  Trimmed so whitespace-only input is treated the same as empty. */
function parseGrid(raw: unknown): GridState | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const map = new Map<string, string>()
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') return null
    if (value.trim() === '') continue
    map.set(key, value)
  }
  return map
}

/** checksUsed for one board serve (nonce), counted from this serve's own
 *  already-committed check_spent events -- never trusted from the client.
 *  Shared between the 'check' path (the budget gate) and the 'complete'
 *  path (the actual scoring input), same boardProgress()-style pattern
 *  connections/submit uses for its mistake count. */
async function checksSpent(sql: ReturnType<typeof getSql>, nonce: string): Promise<number> {
  const rows = (await sql!`
    select count(*) filter (where event_type = 'check_spent') as checks_used
    from events
    where question_id = ${nonce} and game_type = 'crossword'
  `) as Array<{ checks_used: string | number }>
  return Number(rows[0]?.checks_used ?? 0)
}

const TERMINAL_REASONS = ['solved', 'abandoned'] as const

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'bad json' }, { status: 400 })
  }

  const kind = body.kind
  if (kind !== 'check' && kind !== 'complete') {
    return Response.json({ ok: false, error: 'invalid kind' }, { status: 400 })
  }

  const game = getGame('crossword')
  if (game.points.kind !== 'grid') {
    return Response.json({ ok: false, error: 'unsupported scoring shape for this game' }, { status: 400 })
  }
  const points = game.points

  const sql = getSql()
  if (!sql) return Response.json({ ok: false, error: 'database not configured' }, { status: 500 })

  const student = await getCurrentStudent()
  if (!student) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 })

  const boardToken = typeof body.board_token === 'string' ? body.board_token : null
  if (!boardToken) return Response.json({ ok: false, error: 'missing board token' }, { status: 400 })
  const tokenPayload = readBoardToken(boardToken)
  if (!tokenPayload) {
    return Response.json({ ok: false, error: 'invalid or expired board token' }, { status: 400 })
  }
  if (tokenPayload.studentId !== student.id) {
    console.error('crossword/submit: board token student mismatch', {
      token_student_id: tokenPayload.studentId,
      cookie_student_id: student.id,
    })
    return Response.json({ ok: false, error: 'board token does not belong to this student' }, { status: 400 })
  }
  // Every crossword-issued token carries a boardId (see board/route.ts) --
  // its absence means this token was never actually issued by that route.
  if (!tokenPayload.boardId) {
    return Response.json({ ok: false, error: 'board token missing board id' }, { status: 400 })
  }

  const sessionId = typeof body.session_id === 'string' ? body.session_id : null
  if (!sessionId) return Response.json({ ok: false, error: 'missing session_id' }, { status: 400 })

  // Same supersession check connections/submit uses: a token that is no
  // longer the LATEST issued for this (student, session) is rejected, whether
  // or not the newer board was ever played.
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
    console.error('crossword/submit: latest-token lookup failed', err)
    return Response.json({ ok: false, error: 'failed to verify board token' }, { status: 500 })
  }
  if (!isTokenCurrent(latestNonce, tokenPayload.nonce)) {
    return Response.json({ ok: false, error: 'board token superseded', duplicate: true }, { status: 409 })
  }

  const round = typeof body.round === 'number' ? body.round : null
  const clientStudentId = typeof body.client_student_id === 'string' ? body.client_student_id : null
  const { studentIdForInsert } = await attributeStudent(clientStudentId, 'crossword/submit', {
    session_id: sessionId,
    board_id: tokenPayload.boardId,
  })

  // The board, reconstructed server-side WITH answers -- never trusted from
  // anything the client sent, and never returned to the client wholesale
  // (only the reveal array below, and only once the board is genuinely being
  // completed).
  let boardRows: BoardRow[]
  try {
    boardRows = (await sql`
      select
        ce.content_item_id,
        ce.fragment,
        ce.x,
        ce.y,
        ce.direction,
        cb.subject as subject
      from crossword_entries ce
      join content_items ci on ci.id = ce.content_item_id
      join crossword_boards cb on cb.id = ce.board_id
      where ce.board_id = ${tokenPayload.boardId}
        and ci.retired_at is null
      order by ce.ordinal
    `) as BoardRow[]
  } catch (err) {
    console.error('crossword/submit: board reconstruction query failed', err)
    return Response.json({ ok: false, error: 'lookup failed' }, { status: 500 })
  }
  if (boardRows.length === 0) {
    console.error('crossword/submit: reconstructed board has no live entries', { board_id: tokenPayload.boardId })
    return Response.json({ ok: false, error: 'unknown or changed board' }, { status: 404 })
  }
  // Defence in depth: the token's itemIds claim must still be exactly this
  // board's live entry set. A mismatch would mean the board changed between
  // issue and redeem (a retirement mid-flight) -- reject rather than score
  // against a board the student was never actually shown.
  const liveItemIds = boardRows.map((r) => r.content_item_id).sort()
  if (JSON.stringify(liveItemIds) !== JSON.stringify([...tokenPayload.itemIds].sort())) {
    console.error('crossword/submit: token itemIds no longer match the live board', {
      board_id: tokenPayload.boardId,
    })
    return Response.json({ ok: false, error: 'board changed since it was served' }, { status: 409 })
  }
  const board = buildBoard(boardRows, tokenPayload.boardId)
  const entryCount = board.entries.length

  const grid = parseGrid(body.grid)
  if (!grid) return Response.json({ ok: false, error: 'invalid grid' }, { status: 400 })

  if (kind === 'check') {
    const contentItemId = typeof body.content_item_id === 'string' ? body.content_item_id : null
    if (!contentItemId) return Response.json({ ok: false, error: 'missing content_item_id' }, { status: 400 })
    const entry = board.entries.find((e) => e.contentItemId === contentItemId)
    if (!entry) return Response.json({ ok: false, error: 'unknown content_item_id for this board' }, { status: 400 })

    // CAUGHT IN REVIEW: a check_spent request racing after (or arriving
    // late relative to) this nonce's board_complete row used to be accepted
    // unconditionally -- corrupting checks_used's documented correspondence
    // to real events (db/014) and letting a stray check spend budget against
    // a board whose answers were already revealed. The token stays "current"
    // after completion (completing a board does not supersede its own
    // token), so this must be checked explicitly, not inferred from
    // isTokenCurrent above.
    let alreadyCompleted: boolean
    try {
      const done = (await sql`
        select 1 from events
        where question_id = ${tokenPayload.nonce} and event_type = 'board_complete'
        limit 1
      `) as unknown[]
      alreadyCompleted = done.length > 0
    } catch (err) {
      console.error('crossword/submit: completed-board lookup failed', err)
      return Response.json({ ok: false, error: 'failed to verify board state' }, { status: 500 })
    }
    if (alreadyCompleted) {
      return Response.json({ ok: false, error: 'board already completed' }, { status: 409 })
    }

    // CAUGHT IN REVIEW, NOT FIXED HERE -- FLAGGED EXPLICITLY, same posture as
    // db/012 (still unwritten): this checksUsedBefore-then-insert sequence is
    // a select-then-insert race, identical in shape to the mistake-budget
    // race db/012 exists to fix for Connections, and NOT fixed by this
    // migration/route pair either. A burst of concurrent 'check' requests
    // (one per entry, fired together) can each read the same
    // pre-increment count and each pass this gate, spending more than
    // `budget` checks. Unlike Connections' mistake budget, this does NOT
    // inflate score -- scoreBoard's `unused = Math.max(0, budget -
    // checksUsed)` floors at zero, so over-spending checks costs the
    // checkBonus and nothing else -- but it does defeat the budget as a
    // scarce resource and can push `checks_used` in the research log above
    // the intended cap. Accepted as a known, documented limitation for this
    // pass, same as db/012's own status; fixing it properly needs the same
    // per-serve-ordinal-plus-unique-index redesign db/012's own notes
    // describe, which this task did not scope.
    let checksUsedBefore: number
    try {
      checksUsedBefore = await checksSpent(sql, tokenPayload.nonce)
    } catch (err) {
      console.error('crossword/submit: checks-spent lookup failed', err)
      return Response.json({ ok: false, error: 'failed to compute check budget' }, { status: 500 })
    }
    const budget = checkBudget(entryCount, points)
    if (checksUsedBefore >= budget) {
      return Response.json(
        { ok: false, error: 'check budget exhausted', duplicate: false, budgetExhausted: true },
        { status: 409 }
      )
    }

    const status = gradeEntry(entry, grid)
    // CAUGHT IN REVIEW: refuse to spend a check on an entry with no attempt
    // to check at all -- a not_attempted entry always reads as `correct:
    // false` (gradeEntry never returns 'correct' with missing cells), which
    // both wastes a budget unit on a result that carries no information
    // (the student already knows an empty entry isn't right) and writes a
    // check_spent row indistinguishable from a genuine wrong-guess check,
    // corrupting is_correct's usefulness as a behavioural signal.
    if (status === 'not_attempted') {
      return Response.json({ ok: false, error: 'entry not filled in -- nothing to check' }, { status: 400 })
    }
    const correct = status === 'correct'
    const timeTakenMs = typeof body.time_taken_ms === 'number' ? body.time_taken_ms : null

    // lever is written 'none' here, not the registry's declared 'both' --
    // this row records what actually happened (no lever machinery was
    // consumed), not what the registry entry permits for the future. See
    // the route header and lib/games/registry.ts's crossword comment.
    const insertCheckSpent = (studentId: string | null) =>
      sql`
        insert into events
          (session_id, student_id, event_type, game_type, mode, lever, round,
           question_id, board_id, content_item_id, is_correct, adapt_granularity, time_taken_ms)
        values
          (${sessionId}, ${studentId}, 'check_spent', 'crossword', ${null}, 'none', ${round},
           ${tokenPayload.nonce}, ${tokenPayload.boardId}, ${contentItemId}, ${correct}, 'board', ${timeTakenMs})
      `
    await insertBestEffort(insertCheckSpent, studentIdForInsert, 'check_spent')

    return Response.json({
      ok: true,
      contentItemId,
      correct,
      checksRemaining: Math.max(0, budget - (checksUsedBefore + 1)),
    })
  }

  // kind === 'complete' -----------------------------------------------------
  const terminalReasonClaimed = typeof body.terminal_reason === 'string' ? body.terminal_reason : null
  if (!terminalReasonClaimed || !(TERMINAL_REASONS as readonly string[]).includes(terminalReasonClaimed)) {
    return Response.json({ ok: false, error: 'invalid terminal_reason' }, { status: 400 })
  }
  // NOT re-derived -- trusted as-is from the client. See the route header's
  // "ASYMMETRY WITH CONNECTIONS" note for why that is safe here specifically.
  const terminalReason = terminalReasonClaimed as (typeof TERMINAL_REASONS)[number]

  // Never trust a client-supplied grading: the FULL board is graded fresh,
  // server-side, against the answers reconstructed above.
  const grading = gradeBoard(board, grid)

  // Never trust a client-supplied checks-used count either: recomputed fresh
  // from this serve's own already-committed check_spent events.
  let checksUsed: number
  try {
    checksUsed = await checksSpent(sql, tokenPayload.nonce)
  } catch (err) {
    console.error('crossword/submit: checks-spent lookup failed', err)
    return Response.json({ ok: false, error: 'failed to compute check budget' }, { status: 500 })
  }

  const scored = scoreBoard(grading, checksUsed, entryCount, points)
  const timeTakenMs = typeof body.time_taken_ms === 'number' ? body.time_taken_ms : null
  const netBefore = typeof body.round_net_before === 'number' ? body.round_net_before : 0
  const netAfter = netBefore + scored.net

  // Dedupe on the nonce via the SAME generic index match's/Connections'
  // board_complete rows use (db/007's events_board_nonce_uidx, on
  // question_id where event_type = 'board_complete') -- not scoped to
  // game_type, so no new index is needed here either, per the plan this
  // route was built against.
  const insertBoardComplete = (studentId: string | null) =>
    sql`
      insert into events
        (session_id, student_id, event_type, game_type, mode, lever, round, question_id,
         board_id, adapt_granularity, checks_used, entries_correct, entries_wrong,
         entries_not_attempted, time_taken_ms, terminal_reason,
         is_correct, points_delta, negative_applied, net_after)
      values
        (${sessionId}, ${studentId}, 'board_complete', 'crossword', ${null}, 'none', ${round}, ${tokenPayload.nonce},
         ${tokenPayload.boardId}, 'board', ${checksUsed}, ${grading.correct}, ${grading.wrong},
         ${grading.notAttempted}, ${timeTakenMs}, ${terminalReason},
         ${scored.perfect}, ${scored.net}, ${grading.wrong > 0}, ${netAfter})
      on conflict (question_id) where event_type = 'board_complete' do nothing
      returning id
    ` as unknown as Promise<Array<{ id: unknown }>>
  const commit = await insertAnswerAtomic(insertBoardComplete, studentIdForInsert, 'crossword/submit complete')

  if (commit.outcome === 'conflict') {
    // A lost response to the FIRST 'complete' (network drop, tab suspend) --
    // read back what the winning attempt actually recorded and recompute its
    // full breakdown (scoreBoard is pure, so this reproduces the original
    // response exactly), same idempotent-replay shape connections/submit's
    // board_complete conflict branch uses.
    //
    // CONFIRMED IN REVIEW, ACCEPTED AS A KNOWN LOW-SEVERITY LIMITATION, NOT
    // FIXED HERE: `reveal.status` below is recomputed from the RESUBMITTED
    // `grid` on this retry request, not from whatever grid produced the
    // ORIGINAL, now-stored score. `storedScored`'s numeric tallies are
    // always correct (read from the committed row, never re-derived) and
    // scoreBoard() never reads `statuses` as a scoring input -- so this
    // cannot affect points, `checks_used`, or any committed DB row. The
    // narrow risk is purely a DISPLAY one: if a client left the grid
    // editable while a 'complete' response was in flight and the student
    // changed a cell before the retry landed, the per-entry green/red
    // highlighting on this specific replayed response could describe a
    // different grid than the one that was actually scored. Properly fixing
    // this needs persisting the original per-entry statuses at completion
    // time (e.g. into the free `submitted_text` column) and reading them
    // back here instead of re-grading -- out of scope for this pass; the
    // page (app/games/crossword/page.tsx) should lock the grid once a
    // 'complete' request is in flight to make this practically unreachable
    // even though the route itself does not guarantee it.
    try {
      const stored = (await sql`
        select checks_used, entries_correct, entries_wrong, entries_not_attempted, terminal_reason
        from events
        where question_id = ${tokenPayload.nonce} and event_type = 'board_complete'
        limit 1
      `) as Array<{
        checks_used: number | null
        entries_correct: number | null
        entries_wrong: number | null
        entries_not_attempted: number | null
        terminal_reason: string | null
      }>
      if (stored.length > 0 && stored[0].terminal_reason) {
        const freshGrading = gradeBoard(board, grid)
        const storedGrading: BoardGrading = {
          correct: stored[0].entries_correct ?? 0,
          wrong: stored[0].entries_wrong ?? 0,
          notAttempted: stored[0].entries_not_attempted ?? 0,
          statuses: freshGrading.statuses,
        }
        const storedChecksUsed = stored[0].checks_used ?? 0
        const storedScored = scoreBoard(storedGrading, storedChecksUsed, entryCount, points)
        const reveal = board.entries.map((e) => ({
          contentItemId: e.contentItemId,
          answer: e.answer,
          status: freshGrading.statuses.get(e.contentItemId)!,
        }))
        return Response.json(
          {
            ok: false,
            error: 'already completed',
            duplicate: true,
            checksUsed: storedChecksUsed,
            ...storedScored,
            reveal,
          },
          { status: 409 }
        )
      }
    } catch (err) {
      console.error('crossword/submit: stored-completion lookup failed', err)
    }
    // Lookup failed or found nothing (should not happen given the conflict
    // this branch is inside) -- fall back to the bare rejection rather than
    // fabricate a result.
    return Response.json({ ok: false, error: 'already completed', duplicate: true }, { status: 409 })
  }
  if (commit.outcome === 'error') {
    return Response.json({ ok: false, error: 'failed to record board completion' }, { status: 500 })
  }

  // 'inserted': the board is genuinely being completed for the first time.
  // Only now does the answer key reach the client, entry by entry, alongside
  // each entry's graded status.
  const reveal = board.entries.map((e) => ({
    contentItemId: e.contentItemId,
    answer: e.answer,
    status: grading.statuses.get(e.contentItemId)!,
  }))

  return Response.json({ ok: true, checksUsed, ...scored, reveal })
}
