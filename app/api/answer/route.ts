import { getSql } from '@/lib/db/client'
import { getGame } from '@/lib/games/registry'
import { findSeedAnswer } from '@/lib/game/questions.server'
import { attributeStudent, insertAnswerAtomic, findCommittedAnswer } from '@/lib/game/answer-commit'

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

  // Student attribution + the client/cookie mismatch guard now live in
  // lib/game/answer-commit.ts (package A3 extraction) so the
  // choose-the-right-word answer route shares the exact same behaviour --
  // see that file's header. Same log line, same downgrade-to-null rule as
  // before this refactor.
  const clientStudentId = typeof body.client_student_id === 'string' ? body.client_student_id : null
  const { studentIdForInsert } = await attributeStudent(clientStudentId, 'answer', {
    session_id: sessionId,
    item_id: itemId,
  })

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
    // FIX 2 (reworked): one scored commit per (student, session, round,
    // item, boards_completed) -- now enforced by the INSERT itself, not a
    // preceding SELECT. `on conflict ... do nothing returning id` targets
    // db/008's events_answer_commit_uidx; `rows.length > 0` is how
    // insertAnswerAtomic (lib/game/answer-commit.ts) tells "this call won
    // the row" apart from "some other commit already holds this key" without
    // a second query. FIX 5 (cont.): `question_id` is a legacy column from
    // the old `questions` table -- every content_items-driven insert here
    // has always written it as null (content_item_id is the forward path
    // now, db/004). That makes it free, additive-only real estate to carry a
    // fallback marker without a migration: 'seed-fallback' only ever appears
    // on rows scored off the seed bank, never on a real content_items row.
    const insertAnswerEvent = (studentId: string | null) =>
      sql`
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
        on conflict (session_id, round, content_item_id, student_id, boards_completed)
          where event_type = 'question_answered' and content_item_id is not null
          do nothing
        returning id
      ` as unknown as Promise<Array<{ id: unknown }>>
    // FIX 4: mirror app/api/events/route.ts's retry -- a stale session cookie
    // pointing at a students row that's gone (branch reset, re-seed) fails
    // the FK on student_id. Retrying once with a null student_id keeps the
    // row (and the research dataset) instead of silently losing this answer.
    // Now folded into insertAnswerAtomic's three-way classification -- see
    // lib/game/answer-commit.ts.
    const commit = await insertAnswerAtomic(insertAnswerEvent, studentIdForInsert, 'answer')

    if (commit.outcome === 'conflict') {
      // A genuine duplicate -- some other commit (a concurrent request, or an
      // earlier one) already holds this key. Idempotent: look up what that
      // commit actually recorded and return the SAME result, so a client
      // that submitted successfully but never saw the response (dropped
      // network, retry) does not lose the points it already earned. Falls
      // back to a bare rejection if the lookup itself fails or the row is
      // somehow gone -- never fabricate a result. Deliberately still `ok:
      // false` / 409, not `ok: true`: the existing client (app/quiz/page.tsx)
      // only branches on `!res.ok || !data.ok` and has no duplicate-specific
      // handling at all -- flipping this to `ok: true` would make it treat a
      // replay as a brand-new score and double-count the round total, which
      // is the exact bug this fix exists to prevent. The extra fields here
      // are additive so a future client update can use them without a
      // breaking change to this contract.
      const recorded = await findCommittedAnswer(sql, sessionId, round, itemId, commit.studentIdUsed, 'answer')
      if (recorded) {
        return Response.json(
          {
            ok: false,
            error: 'already answered',
            duplicate: true,
            correct: recorded.isCorrect,
            correctIndex: answerIndex,
            pointsDelta: recorded.pointsDelta,
            netAfter: recorded.netAfter,
          },
          { status: 409 }
        )
      }
      return Response.json({ ok: false, error: 'already answered', duplicate: true }, { status: 409 })
    }
    // commit.outcome is 'inserted' or 'error' -- FIX 4's original contract:
    // scoring is still returned to the student even if the log write failed.
    // A lost log row (the DSR dataset's granularity) is worth less than
    // silently failing a student's already-decided answer. 'error' must
    // never be treated the same as 'conflict' -- an insert failure is not
    // evidence of a duplicate.
  }

  return Response.json({ ok: true, correct, correctIndex: answerIndex, pointsDelta, netAfter })
}
