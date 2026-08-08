import { getSql } from '@/lib/db/client'
import { getCurrentStudent } from '@/lib/auth/current-student'
import { issueBoardToken, readBoardToken, BOARD_TOKEN_ISSUED_EVENT_TYPE } from '@/lib/auth/board-token'
import { selectCrosswordBoard, type EligibleCrosswordBoard } from '@/lib/games/crossword-board-select'

// GET /api/crossword/board -- serves one crossword board (package A6).
// Mirrors app/api/connections/board/route.ts's structure closely: least-
// recently-served selection, a signed per-serve board token, a
// BOARD_TOKEN_ISSUED_EVENT_TYPE marker for the same supersession check
// connections'/match's submit routes use. Lever-free by deliberate plan
// decision (docs/architecture -- see the crossword registry entry's own
// comment in lib/games/registry.ts): no resolveLever() call, no setup
// screen, no countdown -- crossword declares `lever: 'both'` but genuinely
// does not consume it in this build.
//
// THE ANSWER KEY MUST NEVER REACH THE CLIENT: crossword_entries.fragment is
// selected below ONLY to compute `length` (the client needs cell counts to
// render blank cells) and is never included in the JSON response. Scoring
// and the one legitimate answer-reveal channel (`reveal` on a genuine
// board-complete) live entirely in app/api/crossword/submit/route.ts, off
// the same crossword_entries rows this route reads, never off anything
// echoed back by the client. Verified by inspecting the actual JSON below,
// not by reading this comment.
//
// Board selection is least-recently-served ONLY (lib/games/crossword-board-
// select.ts) -- recency reorders, never excludes. No difficulty tiebreak:
// crossword_boards has no difficulty column at all (unlike connection_boards,
// which has one, just unpopulated) -- see that module's header.

export async function GET(req: Request) {
  const student = await getCurrentStudent()
  if (!student) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('session_id')
  if (!sessionId) return Response.json({ ok: false, error: 'missing session_id' }, { status: 400 })

  const sql = getSql()
  if (!sql) {
    console.warn('crossword/board: database not configured, cannot serve a board')
    return Response.json({ ok: false, error: 'not enough boards' }, { status: 409 })
  }

  let allBoardRows: Array<{ id: string; subject: string; width: number; height: number }>
  try {
    allBoardRows = (await sql`
      select id, subject, width, height
      from crossword_boards
      where retired_at is null
    `) as typeof allBoardRows
  } catch (err) {
    console.error('crossword/board: crossword_boards query failed', err)
    return Response.json({ ok: false, error: 'not enough boards' }, { status: 409 })
  }
  if (allBoardRows.length === 0) {
    console.warn('crossword/board: no live boards exist')
    return Response.json({ ok: false, error: 'not enough boards' }, { status: 409 })
  }

  const dimsByBoard = new Map(allBoardRows.map((b) => [b.id, { width: b.width, height: b.height }]))
  // difficulty is always null -- crossword_boards has no such column, see
  // crossword-board-select.ts's header.
  const allBoards: EligibleCrosswordBoard[] = allBoardRows.map((b) => ({
    id: b.id,
    subject: b.subject,
    difficulty: null,
  }))

  // Least-recently-served ranking, keyed on the AUTHENTICATED student's whole
  // history with crossword (any session, any round) -- fails open on the
  // lookup itself, same trade-off connections/board's identical block makes:
  // losing "prefer least-recently-served" for one board is a data-quality
  // regression, not the security property the token below depends on.
  let lastServed = new Map<string, number>()
  try {
    const served = (await sql`
      select board_id, max(created_at) as last_served
      from events
      where event_type = 'board_served'
        and game_type = 'crossword'
        and student_id = ${student.id}
        and board_id is not null
      group by board_id
    `) as Array<{ board_id: string; last_served: string | Date }>
    lastServed = new Map(served.map((r) => [r.board_id, new Date(r.last_served).getTime()]))
  } catch (err) {
    console.error('crossword/board: last-served lookup failed', err)
  }

  const selection = selectCrosswordBoard(allBoards, lastServed)
  if (!selection) {
    console.warn('crossword/board: selectCrosswordBoard returned null despite a non-empty pool')
    return Response.json({ ok: false, error: 'not enough boards' }, { status: 409 })
  }
  const dims = dimsByBoard.get(selection.boardId)
  if (!dims) {
    // Cannot happen: selection.boardId always comes from allBoards, whose ids
    // are exactly dimsByBoard's keys -- guarded anyway rather than asserted.
    console.error('crossword/board: selected board has no recorded dimensions', { board_id: selection.boardId })
    return Response.json({ ok: false, error: 'failed to load board' }, { status: 500 })
  }

  // Entry rows -- WITH the answer fragment, needed ONLY to compute `length`
  // below. `fragment` itself is never put on the response object; see the
  // header.
  let rows: Array<{
    content_item_id: string
    clue: string
    x: number
    y: number
    direction: string
    fragment: string
    ordinal: number
  }>
  try {
    rows = (await sql`
      select ce.content_item_id, ce.clue, ce.x, ce.y, ce.direction, ce.fragment, ce.ordinal
      from crossword_entries ce
      join content_items ci on ci.id = ce.content_item_id
      where ce.board_id = ${selection.boardId}
        and ci.retired_at is null
      order by ce.ordinal
    `) as typeof rows
  } catch (err) {
    console.error('crossword/board: board entries query failed', err)
    return Response.json({ ok: false, error: 'failed to load board' }, { status: 500 })
  }
  if (rows.length === 0) {
    // A live board should always have at least one live entry -- a mismatch
    // here means every entry's content_item was retired without the board
    // itself being retired alongside it ('member-retired' reason,
    // db/013's crossword_boards_retired_reason_check). Fail closed rather
    // than serve an empty grid.
    console.error('crossword/board: selected board has no live entries', { board_id: selection.boardId })
    return Response.json({ ok: false, error: 'failed to load board' }, { status: 500 })
  }

  // CAUGHT IN REVIEW: rows.length===0 above only catches EVERY entry being
  // retired. If SOME but not all of a board's entries are retired, this
  // route used to silently serve a truncated grid -- width/height still
  // describing the full authored layout, but with real cells missing and
  // no way for the client to tell "this cell is genuinely blank" from "this
  // cell's entry doesn't exist anymore". Unlike Connections (a fixed 16
  // tiles, checked with a hard `=== 16`), crossword boards have no fixed
  // size to assert against, so the check here is against the board's own
  // total placed-entry count instead of a magic number -- same "fail closed,
  // a human must retire the board" posture as Connections', parameterised
  // per board rather than hardcoded.
  let totalPlaced: number
  try {
    const total = (await sql`
      select count(*) as n from crossword_entries where board_id = ${selection.boardId}
    `) as Array<{ n: string | number }>
    totalPlaced = Number(total[0]?.n ?? 0)
  } catch (err) {
    console.error('crossword/board: total-entry-count query failed', err)
    return Response.json({ ok: false, error: 'failed to load board' }, { status: 500 })
  }
  if (rows.length !== totalPlaced) {
    console.error('crossword/board: board has a partially retired entry set -- refusing to serve a truncated grid', {
      board_id: selection.boardId,
      live: rows.length,
      total: totalPlaced,
    })
    return Response.json({ ok: false, error: 'failed to load board' }, { status: 500 })
  }

  const allItemIds = rows.map((r) => r.content_item_id).sort()

  // difficultyHonored is always false in this build -- no crossword_boards
  // row has (or could have) a difficulty value. Threaded through explicitly
  // (not omitted), same reasoning as connections/board/route.ts: an absent
  // field and a genuinely-false field must read the same to the client, but
  // the client's own default must never be relied on for that.
  const difficultyHonored = false
  const boardToken = issueBoardToken(allItemIds, student.id, difficultyHonored, selection.boardId)
  const nonce = readBoardToken(boardToken)?.nonce
  if (!nonce) {
    console.error('crossword/board: freshly issued token failed to decode, refusing to serve it')
    return Response.json({ ok: false, error: 'failed to issue board' }, { status: 500 })
  }

  // Two server-only marker/log rows, same split connections/board.ts uses:
  // board_token_issued for the security supersession check submit.ts relies
  // on, board_served carrying board_id for the least-recently-served lookup
  // above. Both keyed on the nonce via question_id. No shuffle_seed here --
  // unlike Connections' shuffled tile order, a crossword grid's entry
  // positions are fixed by authoring, not served in a randomised order, so
  // there is nothing to reproduce from a seed.
  try {
    await sql`
      insert into events
        (session_id, student_id, event_type, game_type, question_id)
      values
        (${sessionId}, ${student.id}, ${BOARD_TOKEN_ISSUED_EVENT_TYPE}, 'crossword', ${nonce})
    `
    await sql`
      insert into events
        (session_id, student_id, event_type, game_type, question_id, board_id, adapt_granularity)
      values
        (${sessionId}, ${student.id}, 'board_served', 'crossword', ${nonce}, ${selection.boardId}, 'board')
    `
  } catch (err) {
    console.error('crossword/board: failed to record issued-token/board_served marker', err)
    return Response.json({ ok: false, error: 'failed to issue board' }, { status: 500 })
  }

  return Response.json({
    ok: true,
    boardId: selection.boardId,
    width: dims.width,
    height: dims.height,
    entries: rows.map((r) => ({
      contentItemId: r.content_item_id,
      clue: r.clue,
      x: r.x,
      y: r.y,
      direction: r.direction,
      length: r.fragment.length, // cell count only -- fragment text itself is never sent
      ordinal: r.ordinal,
    })),
    boardToken,
  })
}
