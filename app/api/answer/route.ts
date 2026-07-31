import { NeonDbError } from '@neondatabase/serverless'
import { getSql } from '@/lib/db/client'
import { getCurrentStudent } from '@/lib/auth/current-student'
import { getGame } from '@/lib/games/registry'
import { findSeedAnswer } from '@/lib/game/questions.server'

// POST /api/answer -- the scoring route (package Q1). This is the ONLY place a
// `question_answered` event gets written; app/api/events/route.ts refuses that
// event type from the client. The client sends the item id and which option it
// picked; this route is the one that knows the answer key, decides correctness,
// and prices the result off the game registry (lib/games/registry.ts) -- never
// off anything the client sent. That is what makes the events table an
// admissible research dataset instead of a mirror of whatever the browser claims
// happened.
//
// Looks the item up in `content_items` first (the live pool served by
// app/api/questions/route.ts), then falls back to the seed answer key
// (lib/game/questions.server.ts -- server-only, never imported by a client
// file) so the quiz keeps scoring correctly with no DATABASE_URL configured --
// the same "always playable" contract the questions route already promises
// for reading the pool.
//
// student_id is never accepted from the body -- exactly like app/api/events/route.ts,
// it comes from the signed session cookie only, via getCurrentStudent().
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'bad json' }, { status: 400 })
  }

  const itemId = typeof body.item_id === 'string' ? body.item_id : null
  if (!itemId) return Response.json({ ok: false, error: 'missing item_id' }, { status: 400 })

  // null = no option selected (time-pressure lever timeout). Always scored as
  // wrong, never a validation error -- anything else must be a real integer index,
  // range-checked against the item's own option count below.
  let selected: number | null
  if (body.selected === null) {
    selected = null
  } else if (typeof body.selected === 'number' && Number.isInteger(body.selected)) {
    selected = body.selected
  } else {
    return Response.json({ ok: false, error: 'invalid selected' }, { status: 400 })
  }

  const gameId = typeof body.game_type === 'string' ? body.game_type : null
  if (!gameId) return Response.json({ ok: false, error: 'missing game_type' }, { status: 400 })
  let game
  try {
    game = getGame(gameId)
  } catch {
    return Response.json({ ok: false, error: 'unknown game_type' }, { status: 400 })
  }
  if (game.points.kind !== 'flat') {
    // The quiz is the only caller today and both quiz entries in the registry are
    // flat-scored. A non-flat game id here is a caller bug, not a scoreable event.
    return Response.json({ ok: false, error: 'unsupported scoring shape for this game' }, { status: 400 })
  }

  const sql = getSql()
  const sessionId = typeof body.session_id === 'string' ? body.session_id : null
  const round = typeof body.round === 'number' ? body.round : null
  const student = await getCurrentStudent()

  // client_student_id is the tab's own belief about who it's playing as (set
  // from the last /api/auth/me fetch, never trusted as-is) -- mirrors the
  // mismatch guard in app/api/events/route.ts. A second student logging in on
  // another tab overwrites the shared session cookie; if this tab's belief
  // disagrees with the cookie identity, downgrade the row to a null
  // student_id rather than attribute it to whoever the cookie now belongs to.
  let studentIdForInsert = student?.id ?? null
  const clientStudentId = typeof body.client_student_id === 'string' ? body.client_student_id : null
  if (clientStudentId && student && clientStudentId !== student.id) {
    console.error('answer: client/cookie student_id mismatch, writing null student_id', {
      cookie_student_id: student.id,
      client_student_id: clientStudentId,
      session_id: sessionId,
      item_id: itemId,
    })
    studentIdForInsert = null
  }

  // FIX 2: one scored commit per (student, session, round, item). A repeat
  // must be rejected outright, not re-scored and not re-logged -- otherwise a
  // client can loop POSTs against the same item to inflate lifetime net. The
  // events table (not anything the client sends) is the source of truth for
  // "already answered": `is not distinct from` treats two nulls (both
  // unauthenticated) as equal, matching how student_id is written below.
  if (sql && sessionId) {
    try {
      const dupe = (await sql`
        select 1 from events
        where event_type = 'question_answered'
          and session_id = ${sessionId}
          and round is not distinct from ${round}
          and content_item_id = ${itemId}
          and student_id is not distinct from ${studentIdForInsert}
        limit 1
      `) as Array<{ '?column?': number }>
      if (dupe.length > 0) {
        // No correctIndex, no pointsDelta -- only the commit that actually
        // scores gets to reveal the key.
        return Response.json({ ok: false, error: 'already answered', duplicate: true }, { status: 409 })
      }
    } catch (err) {
      // If the dedupe check itself fails we fall through and still attempt to
      // score -- a lost dedupe check is a farming-risk regression, not silent
      // data corruption, and is logged loudly so it's visible.
      console.error('answer: duplicate-commit check failed', err)
    }
  }

  // The answer key, looked up server-side only -- never trusted from the client.
  let answerIndex: number | null = null
  let optionCount: number | null = null
  let usedSeedFallback = false

  if (sql) {
    try {
      const rows = (await sql`
        select answer, options from content_items where id = ${itemId} and kind = 'mcq'
      `) as Array<{ answer: number; options: string[] }>
      if (rows.length > 0) {
        answerIndex = rows[0].answer
        optionCount = rows[0].options.length
      }
    } catch (err) {
      console.error('answer: content_items lookup failed', err)
    }
  }
  if (answerIndex === null) {
    // FIX 5: this is the seed-fallback path -- either there's no DB, or this
    // item id isn't in content_items. Either way the student is about to be
    // scored off the seed bank, not real course content, and that must never
    // be silently indistinguishable from a normal content_items row.
    const seed = findSeedAnswer(itemId)
    if (seed) {
      answerIndex = seed.answer
      optionCount = seed.optionCount
      usedSeedFallback = true
      console.warn('answer: scoring from seed fallback bank, not content_items', { itemId, sessionId })
    }
  }
  if (answerIndex === null || optionCount === null) {
    return Response.json({ ok: false, error: 'unknown item id' }, { status: 404 })
  }
  if (selected !== null && (selected < 0 || selected >= optionCount)) {
    return Response.json({ ok: false, error: 'option index out of range' }, { status: 400 })
  }

  const correct = selected !== null && selected === answerIndex
  const pointsDelta = correct ? game.points.correct : game.points.wrong

  // `round_net_before` is client-supplied context, not a scoring input -- it only
  // shapes the informational `net_after` column. If it's wrong, only that running
  // total is off; `is_correct` and `points_delta` (the facts the paper rests on)
  // are always computed above, from the server-side answer key and the registry.
  const netBefore = typeof body.round_net_before === 'number' ? body.round_net_before : 0
  const netAfter = netBefore + pointsDelta

  if (sql && sessionId) {
    // FIX 5 (cont.): `question_id` is a legacy column from the old `questions`
    // table -- every content_items-driven insert here has always written it
    // as null (content_item_id is the forward path now, db/004). That makes
    // it free, additive-only real estate to carry a fallback marker without a
    // migration: 'seed-fallback' only ever appears on rows scored off the
    // seed bank, never on a real content_items row.
    const insertAnswerEvent = (studentId: string | null) => sql`
      insert into events
        (session_id, student_id, event_type, game_type, mode, lever, round, question_id,
         content_item_id, selected_option, difficulty_level, time_limit, time_taken_ms,
         is_correct, points_delta, negative_applied, net_after)
      values
        (${sessionId}, ${studentId}, 'question_answered', ${gameId},
         ${typeof body.mode === 'string' ? body.mode : null},
         ${typeof body.lever === 'string' ? body.lever : null},
         ${round},
         ${usedSeedFallback ? 'seed-fallback' : null}, ${itemId}, ${selected},
         ${typeof body.difficulty_level === 'number' ? body.difficulty_level : null},
         ${typeof body.time_limit === 'number' ? body.time_limit : null},
         ${typeof body.time_taken_ms === 'number' ? body.time_taken_ms : null},
         ${correct}, ${pointsDelta}, ${!correct}, ${netAfter})
    `
    try {
      await insertAnswerEvent(studentIdForInsert)
    } catch (err) {
      // FIX 4: mirror app/api/events/route.ts's retry -- a stale session
      // cookie pointing at a students row that's gone (branch reset, re-seed)
      // fails the FK on student_id. Retrying once with a null student_id
      // keeps the row (and the research dataset) instead of silently losing
      // this answer while the student still sees normal feedback.
      if (err instanceof NeonDbError && err.code === '23503') {
        console.error('answer: student_id fk violation, retrying with null student_id', {
          student_id: studentIdForInsert,
          message: err.message,
        })
        try {
          await insertAnswerEvent(null)
        } catch (retryErr) {
          console.error('answer: retry insert with null student_id also failed', retryErr)
        }
      } else {
        // Scoring is still trustworthy even if the row failed to log -- return
        // the result rather than failing the student's answer over a logging error.
        console.error('answer: event insert failed', err)
      }
    }
  }

  return Response.json({ ok: true, correct, correctIndex: answerIndex, pointsDelta, netAfter })
}
