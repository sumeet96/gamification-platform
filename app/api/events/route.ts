import { NeonDbError } from '@neondatabase/serverless'
import { getSql } from '@/lib/db/client'
import { getCurrentStudent } from '@/lib/auth/current-student'
import { CLIENT_EMITTABLE_EVENT_TYPES } from '@/lib/log/logEvent'

type Sql = NonNullable<ReturnType<typeof getSql>>

// Allowlist, not a denylist. `question_answered` (Q1) and `board_complete` (A1) are both
// scored events -- server-written only, from app/api/answer/route.ts and
// app/api/match/submit/route.ts respectively -- and neither appears in
// CLIENT_EMITTABLE_EVENT_TYPES. A denylist that only named `question_answered` failed open
// the moment a second scored event type (`board_complete`) was added: it would have sailed
// through this route and let a forged fetch write an arbitrary points_delta straight into
// the research dataset, and could also have pre-poisoned the duplicate-commit check
// app/api/match/submit/route.ts keys off `board_complete` rows. This is the SAME array the
// client-emittable `EventType` union in lib/log/logEvent.ts is derived from -- not a
// separate list kept in sync by comment -- so the type-level guard and this runtime
// backstop cannot diverge the way two independently-maintained lists could.
const ALLOWED_EVENT_TYPES = new Set<string>(CLIENT_EMITTABLE_EVENT_TYPES)

function insertEvent(sql: Sql, e: Record<string, unknown>, studentId: string | null) {
  return sql`
    insert into events
      (session_id, student_id, event_type, game_type, mode, lever, round, question_id,
       board_id, difficulty_level, time_limit, time_taken_ms, is_correct, points_delta,
       negative_applied, net_after)
    values
      (${e.session_id}, ${studentId}, ${e.event_type}, ${e.game_type ?? null}, ${e.mode ?? null},
       ${e.lever ?? null}, ${e.round ?? null}, ${e.question_id ?? null}, ${e.board_id ?? null},
       ${e.difficulty_level ?? null}, ${e.time_limit ?? null}, ${e.time_taken_ms ?? null},
       ${e.is_correct ?? null}, ${e.points_delta ?? null}, ${e.negative_applied ?? null},
       ${e.net_after ?? null})
  `
}

// POST an interaction event. Writes to Neon when DATABASE_URL is set; otherwise
// accepts and no-ops (the client still logs to the console in dev).
//
// student_id is never trusted from the request body — a client-supplied id would be
// trivially forgeable and would corrupt the research dataset. It is always read from
// the signed session cookie server-side. Unauthenticated visitors still get their
// event written (with a null student_id) rather than dropped.
//
// The body may also carry `client_student_id`: the student id the sending *tab*
// believes it is playing as. This is a browser-wide cookie / per-tab sessionStorage
// mismatch guard — e.g. student A has /quiz open in tab 1, student B logs in on tab 2,
// which overwrites the shared session cookie. Tab A's next event would otherwise be
// written with A's session_id but B's student_id (from the now-B cookie). If
// client_student_id disagrees with the cookie identity, we downgrade the row to a
// null student_id instead. It can only ever null out attribution — it is never used
// as the value written; the actual student_id always comes from the cookie.
export async function POST(req: Request) {
  let e: Record<string, unknown>
  try {
    e = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'bad json' }, { status: 400 })
  }

  // Scored events (`question_answered`, `board_complete`) carry is_correct and
  // points_delta -- scoring facts, not interaction metadata. If this route wrote them
  // as-sent, the event log would just be a mirror of whatever the browser claims
  // happened. Both are server-written only, from app/api/answer/route.ts (Q1) and
  // app/api/match/submit/route.ts (A1) respectively -- this route never writes either.
  if (typeof e.event_type !== 'string' || !ALLOWED_EVENT_TYPES.has(e.event_type)) {
    return Response.json(
      { ok: false, error: `${String(e.event_type)} is server-scored only or unknown; use the scoring route for this game` },
      { status: 403 }
    )
  }

  // Defense in depth: none of the allowlisted types above are scored, so none of them
  // should carry scoring columns either. Nothing in the current UI sets these on a
  // round_*/session_start event, but insertEvent below writes these columns straight from
  // the body for whatever event_type reaches it -- a forged fetch could otherwise smuggle
  // a fake scoring value onto an allowlisted row. None of these move `net`/`gross` in
  // app/api/stats/route.ts today (that query sums points_delta only where event_type is
  // 'question_answered' or 'board_complete', and doesn't read negative_applied at all),
  // but stripping here means a future, less-careful aggregate query can't be fooled by
  // them either. THE FULL LIST OF SCORING COLUMNS ON `events` (keep in sync with
  // insertEvent's column list below): is_correct, points_delta, negative_applied,
  // net_after. Add any new scoring column to BOTH this list and the one above it.
  delete e.is_correct
  delete e.points_delta
  delete e.negative_applied
  delete e.net_after

  // FIX 6 (A5 adversarial review): board_id (added for board_reported_ambiguous
  // to be joinable back to a board at all -- see db/011's header) is an
  // opaque identifier, never a foreign key (db/011), and MUST stay that way
  // here: validated as a non-empty string or dropped entirely, never trusted
  // to widen into a path for a client to smuggle a scoring value the way the
  // delete block above guards against for the columns that actually score.
  if (typeof e.board_id !== 'string' || e.board_id.length === 0) {
    delete e.board_id
  }

  const sql = getSql()
  if (!sql) return Response.json({ ok: true, stored: false })

  const student = await getCurrentStudent()

  // studentId is what actually gets written — sourced from the cookie only, never
  // from `e`. clientStudentId is read purely for comparison, below.
  let studentId = student?.id ?? null
  const clientStudentId = typeof e.client_student_id === 'string' ? e.client_student_id : null
  if (clientStudentId && student && clientStudentId !== student.id) {
    console.error('events: client/cookie student_id mismatch, writing null student_id', {
      cookie_student_id: student.id,
      client_student_id: clientStudentId,
      session_id: e.session_id,
      event_type: e.event_type,
    })
    studentId = null
  }

  try {
    await insertEvent(sql, e, studentId)
    return Response.json({ ok: true, stored: true })
  } catch (err) {
    // The cookie is stateless — if the students row it points at is gone (branch
    // reset, re-seed, manual cleanup) the FK on student_id rejects the insert.
    // Retry once with a null student_id so the event is still captured; losing
    // attribution on a row is recoverable, losing the row is not.
    if (err instanceof NeonDbError && err.code === '23503') {
      console.error('events: student_id fk violation, retrying with null student_id', {
        student_id: student?.id,
        message: err.message,
      })
      try {
        await insertEvent(sql, e, null)
        return Response.json({ ok: true, stored: true })
      } catch (retryErr) {
        console.error('events: retry insert with null student_id also failed', retryErr)
        return Response.json({ ok: false, error: 'failed to store event' }, { status: 500 })
      }
    }
    console.error('events: insert failed', err)
    return Response.json({ ok: false, error: 'failed to store event' }, { status: 500 })
  }
}
