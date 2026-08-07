import { randomInt } from 'node:crypto'
import { getSql } from '@/lib/db/client'
import { getCurrentStudent } from '@/lib/auth/current-student'
import { issueBoardToken, readBoardToken, BOARD_TOKEN_ISSUED_EVENT_TYPE } from '@/lib/auth/board-token'
import { shuffleBoardTiles, type ConnectionsTile } from '@/lib/games/connections'
import { selectConnectionsBoard, type EligibleConnectionsBoard } from '@/lib/games/connections-board-select'

// GET /api/connections/board -- serves one Connections board (package A5).
// Mirrors app/api/match/board/route.ts's structure closely: least-recently-
// served selection, a signed per-serve board token, a
// BOARD_TOKEN_ISSUED_EVENT_TYPE marker for the same supersession check
// match's submit route uses. See docs/NEXT_SESSION_BUILD_BRIEF.md §3/§5/§7
// and lib/games/connections.ts's header for what is deliberately NOT reused:
// no resolveLever(), no BOARD_TIME_BASE, no difficulty tiebreak -- this game
// is lever: 'none' (confirmed by the user 6 Aug 2026).
//
// THE PARTITION MUST NEVER REACH THE CLIENT: boards are pre-authored
// (connection_groups / connection_boards, db/011), so unlike match there is
// no "compose a board from items" step here -- but the same rule applies with
// the same force. The response carries 16 shuffled tiles (contentItemId +
// display text) and the board token, and NOTHING that reveals which 4 belong
// together: no groupId, no label, no membership map. Scoring and group-label
// reveal happen server-side in app/api/connections/submit/route.ts, off the
// same connection_groups rows this route reads, never off anything echoed
// back by the client. This is acceptance criterion §9.4 -- verified by
// inspecting the actual JSON below, not by reading this comment.
//
// Board selection is least-recently-served ONLY (lib/games/connections-board-
// select.ts) -- recency reorders, never excludes, same reasoning as match's
// header on the 8-board lockout it used to have. No difficulty tiebreak: no
// connection_boards row has one yet, and this build doesn't honour one even
// if it did (§6 of the brief).

export async function GET(req: Request) {
  const student = await getCurrentStudent()
  if (!student) return Response.json({ ok: false, error: 'not signed in' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('session_id')
  if (!sessionId) return Response.json({ ok: false, error: 'missing session_id' }, { status: 400 })

  const sql = getSql()
  if (!sql) {
    console.warn('connections/board: database not configured, cannot serve a board')
    return Response.json({ ok: false, error: 'not enough boards' }, { status: 409 })
  }

  let allBoards: EligibleConnectionsBoard[]
  try {
    allBoards = (await sql`
      select id, subject, difficulty
      from connection_boards
      where retired_at is null
    `) as EligibleConnectionsBoard[]
  } catch (err) {
    console.error('connections/board: connection_boards query failed', err)
    return Response.json({ ok: false, error: 'not enough boards' }, { status: 409 })
  }
  if (allBoards.length === 0) {
    console.warn('connections/board: no live boards exist')
    return Response.json({ ok: false, error: 'not enough boards' }, { status: 409 })
  }

  // Least-recently-served ranking, keyed on the AUTHENTICATED student's whole
  // history with connections (any session, any round) -- fails open on the
  // lookup itself, same trade-off match/board.ts makes: losing "prefer
  // least-recently-served" for one board is a data-quality regression, not
  // the security property the token below depends on.
  let lastServed = new Map<string, number>()
  try {
    const served = (await sql`
      select board_id, max(created_at) as last_served
      from events
      where event_type = 'board_served'
        and game_type = 'connections'
        and student_id = ${student.id}
        and board_id is not null
      group by board_id
    `) as Array<{ board_id: string; last_served: string | Date }>
    lastServed = new Map(served.map((r) => [r.board_id, new Date(r.last_served).getTime()]))
  } catch (err) {
    console.error('connections/board: last-served lookup failed', err)
  }

  // targetDifficulty is always null -- §6 of the brief, no difficulty
  // tiebreak in this build. See connections-board-select.ts's doc comment for
  // why this is passed explicitly rather than baked in silently.
  const selection = selectConnectionsBoard(allBoards, lastServed, null)
  if (!selection) {
    console.warn('connections/board: selectConnectionsBoard returned null despite a non-empty pool')
    return Response.json({ ok: false, error: 'not enough boards' }, { status: 409 })
  }

  // Full board contents, WITH group id/label -- this row shape must never be
  // sent to the client as-is. 16 rows expected (4 groups x 4 members); see
  // db/011's cardinality note for why the DB itself cannot enforce that count
  // and the authoring-time verification query it documents instead.
  let rows: Array<{
    group_ordinal: number
    group_id: string
    group_label: string
    content_item_id: string
    tile_text: string
  }>
  try {
    rows = (await sql`
      select
        cbg.ordinal as group_ordinal,
        cg.id as group_id,
        cg.label as group_label,
        ci.id as content_item_id,
        ci.term as tile_text
      from connection_board_groups cbg
      join connection_groups cg on cg.id = cbg.group_id
      join connection_group_members gm on gm.group_id = cg.id
      join content_items ci on ci.id = gm.content_item_id
      where cbg.board_id = ${selection.boardId}
        and ci.retired_at is null
      order by cbg.ordinal, gm.ordinal
    `) as typeof rows
  } catch (err) {
    console.error('connections/board: board contents query failed', err)
    return Response.json({ ok: false, error: 'failed to load board' }, { status: 500 })
  }
  if (rows.length !== 16) {
    // A live board should always have exactly 16 rows (authoring-time
    // invariant, db/011's header) -- a mismatch here means a member was
    // retired without the board being retired alongside it ('member-retired'
    // reason, db/011). Fail closed rather than serve a short board.
    console.error('connections/board: board does not have exactly 16 live tiles', {
      board_id: selection.boardId,
      found: rows.length,
    })
    return Response.json({ ok: false, error: 'failed to load board' }, { status: 500 })
  }

  const allItemIds = rows.map((r) => r.content_item_id).sort()

  // difficultyHonored is always false in this build -- no connection_boards
  // row has a difficulty value (§6). Threaded through explicitly (not
  // omitted) for the exact reason CLAUDE.md flags for A3's badge bug: an
  // absent field and a genuinely-false field must read the same to the
  // client, but the route must still SEND it, not silently rely on the
  // client's own default.
  const difficultyHonored = false
  const boardToken = issueBoardToken(allItemIds, student.id, difficultyHonored, selection.boardId)
  const nonce = readBoardToken(boardToken)?.nonce
  if (!nonce) {
    console.error('connections/board: freshly issued token failed to decode, refusing to serve it')
    return Response.json({ ok: false, error: 'failed to issue board' }, { status: 500 })
  }

  // FIX 1 (A5 adversarial review): the seed MUST NOT be derivable from
  // anything the client can see. It used to be sha256(nonce) -- and the
  // nonce rides the boardToken in plaintext base64url JSON (signed, not
  // encrypted, see lib/auth/board-token.ts's header), so a client could
  // decode its own nonce, replay sha256 + mulberry32 itself, and read the
  // partition straight off which pre-shuffle slot (and therefore which
  // group) each served tile came from. Verified: exact recovery, every
  // trial, zero mistakes, +100 a board -- see
  // tests/connections-shuffle-security.test.ts, which genuinely attempts
  // that reconstruction rather than just checking the response for an
  // absent groupId key.
  //
  // Now a CSPRNG value with no relationship to the nonce, the board id, or
  // any other token field -- the client never needs the seed at all, only
  // the already-shuffled tiles. Still logged verbatim to shuffle_seed on
  // board_served below: that column's job is analysis-time reproducibility
  // (the served order is reconstructable from the log), not client-side
  // derivation, and logging the actual value used satisfies that without
  // exposing anything -- shuffle_seed is a server-only event column, never
  // returned in this route's JSON response.
  const seed = randomInt(0, 0x100000000) // uniform over the full uint32 range
  const tiles: ConnectionsTile[] = shuffleBoardTiles(
    rows.map((r) => ({ contentItemId: r.content_item_id, text: r.tile_text })),
    seed
  )

  // Two server-only marker/log rows, same split match uses (board_token_issued
  // for the security supersession check; board_served is Connections' own
  // addition, §7 of the brief, carrying board_id + the shuffle seed). Both
  // keyed on the nonce via question_id so they cross-reference the guess/
  // board_complete rows this serve will eventually produce. shuffle_seed is
  // a first-class bigint column (db/011, amended in place before this
  // migration was ever applied) -- it does NOT ride in submitted_text; see
  // db/011's header for why that first draft was rejected.
  try {
    await sql`
      insert into events
        (session_id, student_id, event_type, game_type, question_id)
      values
        (${sessionId}, ${student.id}, ${BOARD_TOKEN_ISSUED_EVENT_TYPE}, 'connections', ${nonce})
    `
    await sql`
      insert into events
        (session_id, student_id, event_type, game_type, question_id, board_id, shuffle_seed, adapt_granularity)
      values
        (${sessionId}, ${student.id}, 'board_served', 'connections', ${nonce}, ${selection.boardId}, ${seed}, 'board')
    `
  } catch (err) {
    console.error('connections/board: failed to record issued-token/board_served marker', err)
    return Response.json({ ok: false, error: 'failed to issue board' }, { status: 500 })
  }

  return Response.json({
    ok: true,
    tiles: tiles.map((t) => ({ contentItemId: t.contentItemId, text: t.text })),
    boardToken,
    difficultyHonored,
    // FIX 6 (A5 review): the plain board id, not secret -- it does not reveal
    // the partition (unlike the shuffle seed above, which is never returned
    // here) -- so the client can attach it to board_reported_ambiguous and
    // that event can actually be joined back to a board (see
    // app/api/events/route.ts and app/games/connections/page.tsx's
    // reportAmbiguous()).
    boardId: selection.boardId,
  })
}
