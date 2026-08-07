import { NeonDbError } from '@neondatabase/serverless'
import { getSql } from '@/lib/db/client'
import { getCurrentStudent } from '@/lib/auth/current-student'
import { readBoardToken, isTokenCurrent, BOARD_TOKEN_ISSUED_EVENT_TYPE } from '@/lib/auth/board-token'
import { getGame } from '@/lib/games/registry'
import { attributeStudent, insertAnswerAtomic } from '@/lib/game/answer-commit'
import {
  evaluateGuess, guessHash, scoreBoard, isMistakeBudgetExhausted, deriveTerminalReason,
  type ConnectionsBoard, type ConnectionsGroup, type TerminalReason,
} from '@/lib/games/connections'

// POST /api/connections/submit -- scores Connections play (package A5).
// Mirrors app/api/match/submit/route.ts's security shape (board-token
// verification, the latest-nonce supersession check, cookie-only student
// attribution, the FK-violation retry) but ONE route handles TWO operations,
// distinguished by `body.kind`:
//
//   'guess'    -- one four-tile guess. Fired repeatedly during a board.
//   'complete' -- the board ends (solved / mistake budget spent / abandoned).
//                 Fired once.
//
// DECISION (asked for explicitly by the brief): one route with a
// discriminator, not two files -- the task's own file list only names this
// one submit route, and match's convention of "one POST scores the whole
// unit" doesn't map cleanly onto Connections, where a guess and a board
// completion are genuinely different grains logged at different times. A
// discriminator keeps the board-token verification, student attribution and
// board reconstruction below written ONCE for both operations instead of
// duplicated across two files.
//
// Never trusts a client-supplied score, mistake count, or group membership
// (CLAUDE.md, stated explicitly for this package): `groupsSolved` and
// `mistakes` for board_complete are computed by COUNTING this board serve's
// own already-committed events, never read from the request body. A guess's
// correctness is decided by evaluateGuess against the board reconstructed
// from content_items/connection_* tables, never anything the client asserts.
//
// Never reveals a group's label before it is actually solved, and never
// reveals another group's membership -- see the response shapes below.

/** Same small helper app/api/match/submit/route.ts keeps locally (see that
 *  file's header on why lib/game/answer-commit.ts's insertAnswerAtomic isn't
 *  reused here): a best-effort insert with one retry under a null student_id
 *  on an FK violation (a stale session cookie pointing at a students row
 *  that's gone). Used only for the group_solved event below, which -- unlike
 *  guess_submitted and board_complete -- has no unique index to dedupe
 *  against (a correct guess for a given group can only ever have one
 *  guess_hash, so group_solved can only ever be attempted once per group per
 *  serve; see this route's report for the full reasoning), so it never needs
 *  insertAnswerAtomic's ON CONFLICT ... RETURNING contract. */
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
      console.error(`connections/submit: student_id fk violation on ${label}, retrying with null student_id`, {
        student_id: studentId,
        message: err.message,
      })
      try {
        await insert(null)
        return true
      } catch (retryErr) {
        console.error(`connections/submit: retry insert with null student_id also failed (${label})`, retryErr)
        return false
      }
    }
    console.error(`connections/submit: ${label} insert failed`, err)
    return false
  }
}

type BoardRow = {
  group_ordinal: number
  group_id: string
  group_label: string
  content_item_id: string
  tile_text: string
  subject: string
}

/** Reassemble the full ConnectionsBoard (WITH group ids/labels -- server-side
 *  only, never sent back to the client except a group's own label once it is
 *  actually solved) from the flat 16-row query result. Rows arrive ordered by
 *  (group_ordinal, member ordinal), so consecutive rows sharing a
 *  group_ordinal are always the same group. */
function buildBoard(rows: readonly BoardRow[], boardId: string): ConnectionsBoard {
  const groupsByOrdinal = new Map<number, ConnectionsGroup & { tiles: { contentItemId: string; text: string }[] }>()
  for (const r of rows) {
    let g = groupsByOrdinal.get(r.group_ordinal)
    if (!g) {
      g = { groupId: r.group_id, label: r.group_label, tiles: [] }
      groupsByOrdinal.set(r.group_ordinal, g)
    }
    g.tiles.push({ contentItemId: r.content_item_id, text: r.tile_text })
  }
  const groups = [...groupsByOrdinal.entries()].sort((a, b) => a[0] - b[0]).map(([, g]) => g)
  return { boardId, subject: rows[0]?.subject ?? '', groups }
}

/** groups_solved / mistakes so far for one board serve (nonce), counted from
 *  this serve's own already-committed events -- never trusted from the
 *  client. Shared between the 'guess' path (to compute `forced` and
 *  `mistakesAfter`) and the 'complete' path (the actual scoring input). */
async function boardProgress(
  sql: ReturnType<typeof getSql>,
  nonce: string
): Promise<{ groupsSolved: number; mistakes: number }> {
  const rows = (await sql!`
    select
      count(*) filter (where event_type = 'group_solved') as groups_solved,
      count(*) filter (where event_type = 'guess_submitted' and is_correct = false) as mistakes
    from events
    where question_id = ${nonce} and game_type = 'connections'
  `) as Array<{ groups_solved: string | number; mistakes: string | number }>
  return {
    groupsSolved: Number(rows[0]?.groups_solved ?? 0),
    mistakes: Number(rows[0]?.mistakes ?? 0),
  }
}

const TERMINAL_REASONS = ['solved', 'budget', 'abandoned'] as const

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'bad json' }, { status: 400 })
  }

  const kind = body.kind
  if (kind !== 'guess' && kind !== 'complete') {
    return Response.json({ ok: false, error: 'invalid kind' }, { status: 400 })
  }

  const game = getGame('connections')
  if (game.points.kind !== 'partition') {
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
    console.error('connections/submit: board token student mismatch', {
      token_student_id: tokenPayload.studentId,
      cookie_student_id: student.id,
    })
    return Response.json({ ok: false, error: 'board token does not belong to this student' }, { status: 400 })
  }
  // Every connections-issued token carries a boardId (see board/route.ts) --
  // its absence means this token was never actually issued by that route.
  if (!tokenPayload.boardId) {
    return Response.json({ ok: false, error: 'board token missing board id' }, { status: 400 })
  }

  const sessionId = typeof body.session_id === 'string' ? body.session_id : null
  if (!sessionId) return Response.json({ ok: false, error: 'missing session_id' }, { status: 400 })

  // Same supersession check match's submit route uses: a token that is no
  // longer the LATEST issued for this (student, session) is rejected, whether
  // or not the newer board was ever played. Applied to BOTH operations here
  // (match only has one operation to gate) -- see the report for why this is
  // defence in depth rather than strictly load-bearing for 'guess'.
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
    console.error('connections/submit: latest-token lookup failed', err)
    return Response.json({ ok: false, error: 'failed to verify board token' }, { status: 500 })
  }
  if (!isTokenCurrent(latestNonce, tokenPayload.nonce)) {
    return Response.json({ ok: false, error: 'board token superseded', duplicate: true }, { status: 409 })
  }

  const round = typeof body.round === 'number' ? body.round : null
  const clientStudentId = typeof body.client_student_id === 'string' ? body.client_student_id : null
  const { studentIdForInsert } = await attributeStudent(clientStudentId, 'connections/submit', {
    session_id: sessionId,
    board_id: tokenPayload.boardId,
  })

  // The board, reconstructed server-side WITH group ids/labels -- never
  // trusted from anything the client sent, and never returned to the client
  // wholesale (only individual solved-group labels leak out below, and only
  // once actually solved).
  let boardRows: BoardRow[]
  try {
    boardRows = (await sql`
      select
        cbg.ordinal as group_ordinal,
        cg.id as group_id,
        cg.label as group_label,
        ci.id as content_item_id,
        ci.term as tile_text,
        cb.subject as subject
      from connection_board_groups cbg
      join connection_groups cg on cg.id = cbg.group_id
      join connection_group_members gm on gm.group_id = cg.id
      join content_items ci on ci.id = gm.content_item_id
      join connection_boards cb on cb.id = cbg.board_id
      where cbg.board_id = ${tokenPayload.boardId}
        and ci.retired_at is null
      order by cbg.ordinal, gm.ordinal
    `) as BoardRow[]
  } catch (err) {
    console.error('connections/submit: board reconstruction query failed', err)
    return Response.json({ ok: false, error: 'lookup failed' }, { status: 500 })
  }
  if (boardRows.length !== 16) {
    console.error('connections/submit: reconstructed board does not have exactly 16 live tiles', {
      board_id: tokenPayload.boardId,
      found: boardRows.length,
    })
    return Response.json({ ok: false, error: 'unknown or changed board' }, { status: 404 })
  }
  // Defence in depth: the token's itemIds claim must still be exactly this
  // board's live tile set. A mismatch would mean the board changed between
  // issue and redeem (a retirement mid-flight) -- reject rather than score
  // against a board the student was never actually shown.
  const liveItemIds = boardRows.map((r) => r.content_item_id).sort()
  if (JSON.stringify(liveItemIds) !== JSON.stringify([...tokenPayload.itemIds].sort())) {
    console.error('connections/submit: token itemIds no longer match the live board', {
      board_id: tokenPayload.boardId,
    })
    return Response.json({ ok: false, error: 'board changed since it was served' }, { status: 409 })
  }
  const board = buildBoard(boardRows, tokenPayload.boardId)

  if (kind === 'guess') {
    const guessedRaw = body.guessed_item_ids
    if (!Array.isArray(guessedRaw) || !guessedRaw.every((x) => typeof x === 'string')) {
      return Response.json({ ok: false, error: 'invalid guess payload' }, { status: 400 })
    }
    const guessedItemIds = guessedRaw as string[]

    const { groupsSolved: groupsSolvedBefore, mistakes: priorMistakes } = await boardProgress(sql, tokenPayload.nonce)

    // FIX 2 (A5 adversarial review): once the mistake budget is spent, no
    // FURTHER guess may be recorded or scored -- correct or not. Without
    // this, a client that keeps guessing past the budget could still solve
    // the remaining groups (accrual has no cap of its own), making busting
    // the budget strictly better than stopping. priorMistakes is counted
    // fresh from this serve's own already-committed events above, never
    // trusted from the client, so this cannot be bypassed by a client that
    // simply omits its own local mistake counter. The exact guess that
    // brings mistakes TO the budget is still recorded normally below (this
    // check only refuses the NEXT one) -- isMistakeBudgetExhausted is the
    // same predicate the client's own auto-complete effect mirrors locally.
    if (isMistakeBudgetExhausted(priorMistakes, points)) {
      return Response.json(
        { ok: false, error: 'mistake budget exhausted', duplicate: false, budgetExhausted: true, terminalReason: 'budget' },
        { status: 409 }
      )
    }

    const evaluation = evaluateGuess(board, guessedItemIds, groupsSolvedBefore)
    if (!evaluation.ok) {
      // Malformed: never scored, never charged a mistake, no event written.
      return Response.json({ ok: false, error: 'malformed guess', reason: evaluation.reason }, { status: 400 })
    }

    const hash = guessHash(guessedItemIds)
    const timeTakenMs = typeof body.time_taken_ms === 'number' ? body.time_taken_ms : null
    // FIX 3 (A5 adversarial review): guess_submitted carries NO points --
    // accrual has exactly one home now, group_solved below (see this route's
    // header and app/api/stats/route.ts). `pointsDelta` here is a display-
    // only value for the JSON response (the client shows it as feedback);
    // it is never written to the DB row's points_delta column, which is
    // always null for this event type.
    const pointsDelta = evaluation.correct ? points.perGroup : 0
    // one_away is a first-class boolean column (db/011, amended in place
    // before that migration was ever applied) -- it does NOT ride inside
    // submitted_text. submitted_text keeps its documented purpose (db/007:
    // "the free-text answer a student actually gave when selected_option
    // cannot represent it") and on this row holds ONLY the four guessed
    // tile ids, sorted, nothing else.
    const submittedText = JSON.stringify([...guessedItemIds].sort())

    const insertGuessEvent = (studentId: string | null) =>
      sql`
        insert into events
          (session_id, student_id, event_type, game_type, mode, lever, round,
           question_id, board_id, guess_hash, submitted_text, is_correct, points_delta,
           is_forced, one_away, negative_applied, adapt_granularity, time_taken_ms)
        values
          (${sessionId}, ${studentId}, 'guess_submitted', 'connections', ${null}, 'none', ${round},
           ${tokenPayload.nonce}, ${tokenPayload.boardId}, ${hash}, ${submittedText}, ${evaluation.correct}, ${null},
           ${evaluation.forced}, ${evaluation.oneAway}, ${!evaluation.correct}, 'board', ${timeTakenMs})
        on conflict (question_id, guess_hash) where event_type = 'guess_submitted' do nothing
        returning id
      ` as unknown as Promise<Array<{ id: unknown }>>
    const commit = await insertAnswerAtomic(insertGuessEvent, studentIdForInsert, 'connections/submit guess')

    if (commit.outcome === 'conflict') {
      // ALREADY-GUESSED (including an already-solved group's exact tiles --
      // the only way to name a group's 4 tiles at all is this exact hash, so
      // "already solved" and "this literal guess was already submitted" are
      // the same event here). Read back what the winning attempt recorded
      // rather than re-scoring, per the brief. `forced` is read from the
      // stored row (the state at the ORIGINAL insert); every other field
      // (including `pointsDelta`, a display-only value never stored -- FIX 3
      // above) is recomputed from `evaluation`, a pure function of (board,
      // guessedItemIds) alone, so it is identical either way.
      let storedForced = evaluation.forced
      try {
        const stored = (await sql`
          select is_forced from events
          where question_id = ${tokenPayload.nonce} and guess_hash = ${hash} and event_type = 'guess_submitted'
          limit 1
        `) as Array<{ is_forced: boolean | null }>
        if (stored.length > 0) {
          storedForced = stored[0].is_forced ?? evaluation.forced
        }
      } catch (err) {
        console.error('connections/submit: stored-guess lookup failed', err)
      }
      const group = evaluation.correct ? board.groups[evaluation.groupOrdinal!] : null
      return Response.json(
        {
          ok: false,
          error: 'already guessed',
          duplicate: true,
          correct: evaluation.correct,
          groupId: group?.groupId ?? null,
          groupOrdinal: evaluation.groupOrdinal,
          groupLabel: group?.label ?? null,
          oneAway: evaluation.oneAway,
          forced: storedForced,
          pointsDelta,
        },
        { status: 409 }
      )
    }
    if (commit.outcome === 'error') {
      return Response.json({ ok: false, error: 'failed to record guess' }, { status: 500 })
    }

    // 'inserted': a genuinely new guess. Only now does a correct guess reveal
    // its group's label and only fire group_solved -- best-effort (see
    // insertBestEffort's doc comment above for why a failure here is a
    // missing diagnostic row, not inflated or lost points: board_complete
    // recomputes groupsSolved/mistakes by counting these rows fresh, so a
    // dropped group_solved would undercount rather than overcount).
    let groupLabel: string | null = null
    if (evaluation.correct) {
      const group = board.groups[evaluation.groupOrdinal!]
      groupLabel = group.label
      const insertGroupSolved = (studentId: string | null) =>
        sql`
          insert into events
            (session_id, student_id, event_type, game_type, mode, lever, round,
             question_id, board_id, group_ordinal, is_forced, points_delta, adapt_granularity)
          values
            (${sessionId}, ${studentId}, 'group_solved', 'connections', ${null}, 'none', ${round},
             ${tokenPayload.nonce}, ${tokenPayload.boardId}, ${evaluation.groupOrdinal}, ${evaluation.forced}, ${points.perGroup}, 'board')
        `
      await insertBestEffort(insertGroupSolved, studentIdForInsert, 'group_solved')
    }

    return Response.json({
      ok: true,
      correct: evaluation.correct,
      groupId: evaluation.correct ? board.groups[evaluation.groupOrdinal!].groupId : null,
      groupOrdinal: evaluation.correct ? evaluation.groupOrdinal : null,
      groupLabel,
      oneAway: evaluation.oneAway,
      forced: evaluation.forced,
      mistakesAfter: priorMistakes + (evaluation.correct ? 0 : 1),
      pointsDelta,
    })
  }

  // kind === 'complete' -----------------------------------------------------
  const terminalReasonClaimed = typeof body.terminal_reason === 'string' ? body.terminal_reason : null
  if (!terminalReasonClaimed || !(TERMINAL_REASONS as readonly string[]).includes(terminalReasonClaimed)) {
    return Response.json({ ok: false, error: 'invalid terminal_reason' }, { status: 400 })
  }

  // Never trust a client-supplied score or mistake count: both are counted
  // fresh from this serve's own already-committed events.
  let groupsSolved: number
  let mistakes: number
  try {
    ;({ groupsSolved, mistakes } = await boardProgress(sql, tokenPayload.nonce))
  } catch (err) {
    console.error('connections/submit: board progress lookup failed', err)
    return Response.json({ ok: false, error: 'failed to compute board state' }, { status: 500 })
  }

  // The terminal reason is DERIVED from server-known state, never taken from
  // the request body -- see deriveTerminalReason's comment for why that
  // distinction is load-bearing rather than stylistic.
  const terminalReason: TerminalReason = deriveTerminalReason(groupsSolved, mistakes, points)

  // Kept only as a research signal: a mismatch means the client's view of the
  // board diverged from the server's, which is worth being able to count
  // later. It never feeds scoring.
  if (terminalReasonClaimed !== terminalReason) {
    console.warn(
      `connections/submit: terminal_reason claimed '${terminalReasonClaimed}' but derived '${terminalReason}' ` +
        `(groupsSolved=${groupsSolved}, mistakes=${mistakes})`
    )
  }

  const scored = scoreBoard(groupsSolved, mistakes, points, terminalReason)
  const deselectCount = typeof body.deselect_count === 'number' ? body.deselect_count : null
  const shuffleCount = typeof body.shuffle_count === 'number' ? body.shuffle_count : null
  const timeTakenMs = typeof body.time_taken_ms === 'number' ? body.time_taken_ms : null
  const boardsCompleted =
    typeof body.boards_completed === 'number' && Number.isInteger(body.boards_completed) ? body.boards_completed : null
  const netBefore = typeof body.round_net_before === 'number' ? body.round_net_before : 0
  const netAfter = netBefore + scored.net

  // Dedupe on the nonce via the SAME index match's board_complete rows use
  // (db/007's events_board_nonce_uidx, on question_id where event_type =
  // 'board_complete') -- no new index needed, per the brief. FIX 3 (A5
  // adversarial review): points_delta here is mistakeCost + bonus + floor --
  // NOT accrual, which already went out per-group on group_solved above (see
  // this route's header). Every component of the score now has exactly one
  // home: group_solved carries perGroup accrual, board_complete carries
  // mistakeCost + perfectBonus + floor, guess_submitted carries nothing.
  // Summing points_delta over (group_solved, board_complete) for this nonce
  // equals scoreBoard().net exactly -- asserted in
  // tests/connections.test.ts.
  const insertBoardComplete = (studentId: string | null) =>
    sql`
      insert into events
        (session_id, student_id, event_type, game_type, mode, lever, round, question_id,
         board_id, adapt_granularity, boards_completed, groups_solved, mistakes_made,
         deselect_count, shuffle_count, time_taken_ms, terminal_reason,
         is_correct, points_delta, negative_applied, net_after)
      values
        (${sessionId}, ${studentId}, 'board_complete', 'connections', ${null}, 'none', ${round}, ${tokenPayload.nonce},
         ${tokenPayload.boardId}, 'board', ${boardsCompleted}, ${groupsSolved}, ${mistakes},
         ${deselectCount}, ${shuffleCount}, ${timeTakenMs}, ${terminalReason},
         ${groupsSolved === 4}, ${scored.mistakeCost + scored.bonus + scored.floor}, ${scored.floor !== 0}, ${netAfter})
      on conflict (question_id) where event_type = 'board_complete' do nothing
      returning id
    ` as unknown as Promise<Array<{ id: unknown }>>
  const commit = await insertAnswerAtomic(insertBoardComplete, studentIdForInsert, 'connections/submit complete')

  if (commit.outcome === 'conflict') {
    // FIX 7 (A5 adversarial review): a lost response to the FIRST 'complete'
    // (network drop, tab suspend) used to leave a Retry stuck here forever --
    // this branch returned a bare 409 with nothing to reconcile, so
    // lastScored stayed null and Next Board stayed disabled; only Exit
    // escaped. Now mirrors the 'guess' path's duplicate handling: read back
    // what the winning attempt actually recorded and recompute its full
    // breakdown (scoreBoard is pure, so this reproduces the original
    // response exactly), so the client can proceed as if this request had
    // succeeded the first time.
    try {
      const stored = (await sql`
        select groups_solved, mistakes_made, terminal_reason
        from events
        where question_id = ${tokenPayload.nonce} and event_type = 'board_complete'
        limit 1
      `) as Array<{ groups_solved: number | null; mistakes_made: number | null; terminal_reason: string | null }>
      if (stored.length > 0 && stored[0].terminal_reason) {
        const storedGroupsSolved = stored[0].groups_solved ?? 0
        const storedMistakes = stored[0].mistakes_made ?? 0
        const storedScored = scoreBoard(
          storedGroupsSolved,
          storedMistakes,
          points,
          stored[0].terminal_reason as TerminalReason
        )
        return Response.json(
          { ok: false, error: 'already completed', duplicate: true, groupsSolved: storedGroupsSolved, mistakes: storedMistakes, ...storedScored },
          { status: 409 }
        )
      }
    } catch (err) {
      console.error('connections/submit: stored-completion lookup failed', err)
    }
    // Lookup failed or found nothing (should not happen given the conflict
    // this branch is inside) -- fall back to the bare rejection rather than
    // fabricate a result.
    return Response.json({ ok: false, error: 'already completed', duplicate: true }, { status: 409 })
  }
  if (commit.outcome === 'error') {
    return Response.json({ ok: false, error: 'failed to record board completion' }, { status: 500 })
  }

  return Response.json({ ok: true, groupsSolved, mistakes, ...scored })
}
