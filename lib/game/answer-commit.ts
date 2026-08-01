// Package A3: extracted from app/api/answer/route.ts (package Q1) so the
// choose-the-right-word answer route (app/api/word/answer/route.ts) gets
// IDENTICAL commit-safety behaviour instead of a second hand-copied
// implementation. This is the most safety-critical file in the repo -- see
// the header comments on both call sites for the specific past defects each
// piece here fixes (cookie-only student attribution, the client/cookie
// mismatch guard, the atomic insert-is-the-lock dedupe, the FK-violation
// retry).
//
// Reworked (post-A3) to close a live-proven race: the original dedupe here
// was a SELECT-then-INSERT, non-atomic on the Neon HTTP driver (no
// transaction). 12 concurrent POSTs against the same question all passed the
// SELECT before any INSERT landed, and all 12 scored. This mirrors EXACTLY
// the fix package A1 applied to match's board_complete dedupe
// (insertBoardCompleteAtomic in app/api/match/submit/route.ts) -- the INSERT
// is now the lock, via the partial unique index
// `events_answer_commit_uidx on events (session_id, round, content_item_id,
// student_id, boards_completed) nulls not distinct where event_type =
// 'question_answered' and content_item_id is not null` (db/008, authored by
// a db-engineer agent in parallel with this change -- NOT YET APPLIED to the
// database as of this write, see that migration's header for the blocker).
// `boards_completed` is in the key because match legitimately writes the
// same content_item_id twice in one (session, round) across different
// boards; quiz and choose-word always write it null.
//
// Deliberately NOT used by app/api/match/submit/route.ts, which keeps its
// own local copies of similarly-shaped helpers (insertWithFkRetry,
// insertBoardCompleteAtomic): match's dedupe is keyed on a signed board
// token's nonce via a unique index, not the (student, session, round, item)
// tuple this module dedupes on, and match writes multiple events per commit
// where this module's callers write exactly one. Bending this module to fit
// match too would either lose its atomic dedupe or complicate this one for a
// single caller -- out of scope regardless (app/api/match/** belongs to
// another package).

import { NeonDbError, type NeonQueryFunction } from '@neondatabase/serverless'

type Sql = NeonQueryFunction<false, false>

export interface StudentAttribution {
  student: { id: string } | null
  studentIdForInsert: string | null
}

/**
 * Resolve the authenticated student (cookie-only, via getCurrentStudent())
 * and decide which student_id to actually write. `clientStudentId` is the
 * tab's own belief about who it's playing as (set from the last successful
 * /api/auth/me fetch, never trusted as-is) -- if it disagrees with the
 * cookie identity, the row is downgraded to a null student_id rather than
 * attributed to whoever the cookie now belongs to (a second student logging
 * in on another tab overwrites the shared session cookie). `context` is
 * merged into the mismatch log line for caller-specific fields (e.g.
 * session_id, item_id).
 *
 * `getCurrentStudent` is imported dynamically, not statically, so that this
 * file stays importable under `node --test`: it transitively pulls in
 * `next/headers` (lib/auth/current-student.ts), which is unresolvable
 * outside the Next.js runtime -- a static top-level import of it would make
 * the WHOLE module (including the pure insertAnswerAtomic/findCommittedAnswer
 * below, which this file's tests exercise directly) fail to load under the
 * plain node test runner, exactly the trap the route files already avoid by
 * keeping testable logic behind relative imports. Deferred to call time, so
 * it is only ever reached from the real route handlers, which do run inside
 * the Next.js request context.
 */
export async function attributeStudent(
  clientStudentId: string | null,
  logLabel: string,
  context: Record<string, unknown>
): Promise<StudentAttribution> {
  const { getCurrentStudent } = await import('../auth/current-student')
  const student = await getCurrentStudent()
  let studentIdForInsert = student?.id ?? null
  if (clientStudentId && student && clientStudentId !== student.id) {
    console.error(`${logLabel}: client/cookie student_id mismatch, writing null student_id`, {
      cookie_student_id: student.id,
      client_student_id: clientStudentId,
      ...context,
    })
    studentIdForInsert = null
  }
  return { student, studentIdForInsert }
}

/** The three-way outcome of an atomic commit attempt, identical in shape and
 *  meaning to app/api/match/submit/route.ts's BoardCompleteOutcome:
 *   - 'inserted': this call's INSERT is the row that won the unique index --
 *     the student is genuinely being scored for the first time.
 *   - 'conflict': `on conflict ... do nothing` fired -- some other commit
 *     (a concurrent request, or an earlier one) already holds this
 *     (session, round, item, student, boards_completed) key. NOT an error --
 *     see insertAnswerAtomic below for why the two must stay distinct.
 *   - 'error': the insert itself failed for a reason that is neither the
 *     expected unique-index conflict nor the FK-retry case. Must never be
 *     treated as a duplicate by a caller -- doing so would silently discard
 *     a legitimately-scoreable answer.
 */
export type AnswerCommitOutcome = 'inserted' | 'conflict' | 'error'

export interface AnswerCommitResult {
  outcome: AnswerCommitOutcome
  // Which student_id the winning (or losing) attempt actually used -- equal
  // to the `studentId` argument unless the FK retry fired, in which case
  // it's null. Callers need this to look up the conflicting row on
  // 'conflict': the row that already exists was written under WHICHEVER
  // student_id this attempt's own insert used, not necessarily the
  // caller's original studentIdForInsert.
  studentIdUsed: string | null
}

/**
 * One scored commit per (student, session, round, item, boards_completed) --
 * made atomic by making the INSERT itself the lock, exactly the pattern
 * app/api/match/submit/route.ts's insertBoardCompleteAtomic uses against
 * db/007's board-nonce index. `insert` is the caller's own tagged-template
 * `insert ... on conflict (...) where event_type = 'question_answered' and
 * content_item_id is not null do nothing returning id` against db/008's
 * events_answer_commit_uidx, parameterised by which student_id to write.
 * `rows.length > 0` means this call's insert is the one that landed;
 * `rows.length === 0` means `on conflict do nothing` suppressed it -- some
 * other commit already holds this key.
 *
 * Mirrors app/api/answer/route.ts's original FIX 4 for the FK-violation
 * retry (a stale session cookie pointing at a students row that's gone --
 * branch reset, re-seed): retried once with a null student_id. The retry
 * inserts a DIFFERENT row for the unique index's purposes (a different
 * student_id value), so it is independently conflict-checked against
 * whatever null-student_id row may already exist for this same key -- it can
 * land as 'inserted' even after the first attempt's FK violation, or itself
 * come back 'conflict' if a null-student_id row for this key already exists.
 *
 * Any other error (on either attempt) is 'error', never silently folded into
 * 'conflict' -- app/api/answer/route.ts's deliberate "still score the
 * student even if the log write failed" behaviour depends on 'error' being
 * distinguishable from a genuine duplicate at the call site.
 */
export async function insertAnswerAtomic(
  insert: (studentId: string | null) => Promise<Array<{ id: unknown }>>,
  studentId: string | null,
  logLabel: string
): Promise<AnswerCommitResult> {
  try {
    const rows = await insert(studentId)
    return { outcome: rows.length > 0 ? 'inserted' : 'conflict', studentIdUsed: studentId }
  } catch (err) {
    if (err instanceof NeonDbError && err.code === '23503') {
      console.error(`${logLabel}: student_id fk violation, retrying with null student_id`, {
        student_id: studentId,
        message: err.message,
      })
      try {
        const rows = await insert(null)
        return { outcome: rows.length > 0 ? 'inserted' : 'conflict', studentIdUsed: null }
      } catch (retryErr) {
        console.error(`${logLabel}: retry insert with null student_id also failed`, retryErr)
        return { outcome: 'error', studentIdUsed: null }
      }
    }
    console.error(`${logLabel}: event insert failed`, err)
    return { outcome: 'error', studentIdUsed: studentId }
  }
}

/** The subset of a committed `question_answered` row a caller needs to
 *  reconstruct the response an earlier, successful commit already returned. */
export interface CommittedAnswer {
  isCorrect: boolean | null
  pointsDelta: number | null
  netAfter: number | null
}

/**
 * Looks up the row that won a 'conflict' outcome above, so the caller can
 * make its duplicate response idempotent (same correct/pointsDelta/netAfter
 * the original commit returned) instead of a bare rejection. Keyed on
 * exactly the same tuple as the unique index, using `studentIdUsed` -- the
 * student_id THIS request's own insert attempt used, not necessarily the
 * caller's original studentIdForInsert (see insertAnswerAtomic's FK-retry
 * comment) -- so this can never surface a row committed under a different
 * identity. `boards_completed is null` narrows to quiz/choose-word rows
 * specifically (match's board rows share the same index but are never
 * looked up through this module -- see the file header).
 *
 * Returns null on a lookup error OR a genuine miss (e.g. the conflicting row
 * was deleted between the insert and this read) -- callers must fall back to
 * a bare rejection rather than fabricate a result.
 */
export async function findCommittedAnswer(
  sql: Sql,
  sessionId: string,
  round: number | null,
  itemId: string,
  studentIdUsed: string | null,
  logLabel: string
): Promise<CommittedAnswer | null> {
  try {
    const rows = (await sql`
      select is_correct, points_delta, net_after
      from events
      where event_type = 'question_answered'
        and session_id = ${sessionId}
        and round is not distinct from ${round}
        and content_item_id = ${itemId}
        and student_id is not distinct from ${studentIdUsed}
        and boards_completed is null
      limit 1
    `) as Array<{ is_correct: boolean | null; points_delta: number | null; net_after: number | null }>
    if (rows.length === 0) return null
    return { isCorrect: rows[0].is_correct, pointsDelta: rows[0].points_delta, netAfter: rows[0].net_after }
  } catch (err) {
    console.error(`${logLabel}: committed-answer lookup failed`, err)
    return null
  }
}
