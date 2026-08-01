import { getSql } from '@/lib/db/client'
import { getGame } from '@/lib/games/registry'
import { matchesTerm } from '@/lib/games/match'
import { isOfferedOption } from '@/lib/games/word'
import { attributeStudent, insertAnswerAtomic, findCommittedAnswer } from '@/lib/game/answer-commit'

// POST /api/word/answer -- scores one choose-the-right-word item (package A3).
// Mirrors app/api/answer/route.ts closely (both now share
// lib/game/answer-commit.ts for student attribution, the client/cookie
// mismatch guard, the atomic insert-is-the-lock dedupe, and the
// FK-violation retry -- see that file's header): server-side scoring off the
// DB answer key, cookie-only student attribution, one committed row per
// (student, session, round, item), a repeat rejected outright without
// revealing the key.
//
// Never trusts `selected_text` as the answer on its own two counts: (1) it is
// re-checked against the item's own `term`/`distractors` columns
// (isOfferedOption, lib/games/word.ts) so a client cannot submit an arbitrary
// string that was never actually offered, and (2) correctness itself is
// decided by matchesTerm (lib/games/match.ts) against the item's real `term`
// and declared `variants`, re-read from content_items by item_id -- never off
// anything the client claims is correct.
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'bad json' }, { status: 400 })
  }

  const itemId = typeof body.item_id === 'string' ? body.item_id : null
  if (!itemId) return Response.json({ ok: false, error: 'missing item_id' }, { status: 400 })

  // null = no answer selected (time-pressure lever timeout, mirrors
  // app/api/answer/route.ts's `selected`). Always scored as wrong, never a
  // validation error -- anything else must be a non-empty string, membership-
  // checked against the item's real options below.
  let selectedText: string | null
  if (body.selected_text === null) {
    selectedText = null
  } else if (typeof body.selected_text === 'string') {
    selectedText = body.selected_text
  } else {
    return Response.json({ ok: false, error: 'invalid selected_text' }, { status: 400 })
  }

  const game = getGame('choose-word')
  if (game.points.kind !== 'flat') {
    // Registry guard, mirrors app/api/answer/route.ts's flat-shape check --
    // choose-word is FlatPoints today; a future re-shape here is a caller
    // bug, not a scoreable event.
    return Response.json({ ok: false, error: 'unsupported scoring shape for this game' }, { status: 400 })
  }

  const sql = getSql()
  if (!sql) return Response.json({ ok: false, error: 'database not configured' }, { status: 500 })

  const sessionId = typeof body.session_id === 'string' ? body.session_id : null
  // Required (unlike the quiz's tolerant `if (sql && sessionId)` skip):
  // events.session_id is NOT NULL, and the atomic dedupe insert below is
  // keyed on it -- a missing session_id here would either fail the insert
  // silently or, worse, land outside the unique index's key entirely.
  if (!sessionId) return Response.json({ ok: false, error: 'missing session_id' }, { status: 400 })
  const round = typeof body.round === 'number' ? body.round : null

  const clientStudentId = typeof body.client_student_id === 'string' ? body.client_student_id : null
  const { studentIdForInsert } = await attributeStudent(clientStudentId, 'word/answer', {
    session_id: sessionId,
    item_id: itemId,
  })

  // The answer key, looked up server-side only -- never trusted from the
  // client. `difficulty` is re-read here (not just term/variants) so
  // difficultyHonored below can be decided from the item's REAL calibration
  // state rather than anything the client claims about what was served.
  let item: { term: string; variants: string[]; distractors: string[]; difficulty: number | null } | null = null
  try {
    const rows = (await sql`
      select term, variants, distractors, difficulty
      from content_items
      where id = ${itemId} and kind = 'term_definition'
    `) as Array<{ term: string; variants: unknown; distractors: unknown; difficulty: number | null }>
    if (rows.length > 0) {
      const r = rows[0]
      item = {
        term: r.term,
        variants: Array.isArray(r.variants) ? (r.variants as string[]) : [],
        distractors: Array.isArray(r.distractors) ? (r.distractors as string[]) : [],
        difficulty: r.difficulty,
      }
    }
  } catch (err) {
    console.error('word/answer: content_items lookup failed', err)
  }
  if (!item) return Response.json({ ok: false, error: 'unknown item id' }, { status: 404 })

  // The client must not be able to submit a string that was never one of the
  // options this item could have produced -- checked against the SAME
  // deterministic term+up-to-3-distractors set the question route serves
  // (lib/games/word.ts), so no token is needed to carry "which 3" across the
  // two requests.
  if (selectedText !== null && !isOfferedOption(selectedText, item.term, item.distractors)) {
    return Response.json({ ok: false, error: 'selected_text was never offered for this item' }, { status: 400 })
  }

  const correct = selectedText !== null && matchesTerm(selectedText, { itemId, clue: '', term: item.term, variants: item.variants })
  const pointsDelta = correct ? game.points.correct : game.points.wrong

  // `round_net_before` is client-supplied context, not a scoring input -- see
  // app/api/answer/route.ts's identical comment. `is_correct` and
  // `points_delta` are always computed above, from the server-side answer key
  // and the registry.
  const netBefore = typeof body.round_net_before === 'number' ? body.round_net_before : 0
  const netAfter = netBefore + pointsDelta

  // Never assert a difficulty_level the item didn't actually carry -- same
  // precedent as match's `difficultyHonored` flag (lib/games/match-board-select.ts),
  // decided here per-item off the REAL content_items.difficulty column rather
  // than anything the client claims, since choose-the-right-word has no
  // signed token to carry a per-request decision from GET to POST. All term
  // rows are NULL difficulty today, so this is always null for now -- that is
  // the correct behaviour, not a gap.
  const difficultyHonored = item.difficulty !== null
  const requestedDifficultyLevel = typeof body.difficulty_level === 'number' ? body.difficulty_level : null
  const difficultyLevel = difficultyHonored ? requestedDifficultyLevel : null

  const mode = typeof body.mode === 'string' ? body.mode : null
  const lever = typeof body.lever === 'string' ? body.lever : null
  const timeLimit = typeof body.time_limit === 'number' ? body.time_limit : null
  const timeTakenMs = typeof body.time_taken_ms === 'number' ? body.time_taken_ms : null

  // `submitted_text` (db/007) carries the student's actual answer -- the
  // misconception signal ("which wrong option did they choose"). `selected_option`
  // stays null: it is an int column for MCQ indices, not a term string.
  // FIX (was SELECT-then-INSERT, non-atomic on the Neon HTTP driver -- a live
  // race test fired 12 concurrent POSTs for one question and all 12 scored):
  // the INSERT is now the lock, via `on conflict ... do nothing returning
  // id` against db/008's events_answer_commit_uidx. See
  // lib/game/answer-commit.ts's insertAnswerAtomic for the three-way outcome
  // classification this shares with app/api/answer/route.ts.
  const insertAnswerEvent = (studentId: string | null) =>
    sql`
      insert into events
        (session_id, student_id, event_type, game_type, mode, lever, round,
         content_item_id, selected_option, submitted_text, adapt_granularity,
         difficulty_level, time_limit, time_taken_ms,
         is_correct, points_delta, negative_applied, net_after)
      values
        (${sessionId}, ${studentId}, 'question_answered', 'choose-word', ${mode}, ${lever}, ${round},
         ${itemId}, ${null}, ${selectedText}, 'item',
         ${difficultyLevel}, ${timeLimit}, ${timeTakenMs},
         ${correct}, ${pointsDelta}, ${!correct}, ${netAfter})
      on conflict (session_id, round, content_item_id, student_id, boards_completed)
        where event_type = 'question_answered' and content_item_id is not null
        do nothing
      returning id
    ` as unknown as Promise<Array<{ id: unknown }>>
  const commit = await insertAnswerAtomic(insertAnswerEvent, studentIdForInsert, 'word/answer')

  if (commit.outcome === 'conflict') {
    // Idempotent duplicate response -- same reasoning as app/api/answer/route.ts's
    // identical branch (see that file's comment): look up what the winning
    // commit actually recorded and return the same correct/pointsDelta/netAfter,
    // `duplicate: true`, still `ok: false` / 409 so the existing client
    // (app/games/word/page.tsx, which already special-cases `data.duplicate`
    // on the failure path into a terminal 'duplicateAnswer' phase) keeps its
    // current behaviour unchanged -- the extra fields are additive for a
    // future client update, not a contract break today.
    const recorded = await findCommittedAnswer(sql, sessionId, round, itemId, commit.studentIdUsed, 'word/answer')
    if (recorded) {
      return Response.json(
        {
          ok: false,
          error: 'already answered',
          duplicate: true,
          correct: recorded.isCorrect,
          correctText: item.term,
          pointsDelta: recorded.pointsDelta,
          netAfter: recorded.netAfter,
        },
        { status: 409 }
      )
    }
    return Response.json({ ok: false, error: 'already answered', duplicate: true }, { status: 409 })
  }
  // commit.outcome is 'inserted' or 'error' -- mirrors app/api/answer/route.ts:
  // scoring is still returned even if the log write failed; 'error' must
  // never be folded into the 'conflict' (duplicate) path.

  return Response.json({ ok: true, correct, correctText: item.term, pointsDelta, netAfter })
}
