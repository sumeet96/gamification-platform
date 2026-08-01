// Covers the atomic-commit rework in lib/game/answer-commit.ts: a live race
// test (12 concurrent POSTs against one question) proved the old
// SELECT-then-INSERT dedupe non-atomic on the Neon HTTP driver -- all 12
// scored. insertAnswerAtomic replaces it with "the INSERT is the lock"
// (mirroring app/api/match/submit/route.ts's insertBoardCompleteAtomic), and
// findCommittedAnswer makes a 'conflict' outcome idempotent instead of a bare
// rejection. Both are pure enough to test with a fake `insert`/`sql` --
// attributeStudent is NOT covered here (it needs next/headers, unresolvable
// under `node --test`; see the dynamic-import comment on it in the source
// file for why that no longer blocks THIS file from loading).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NeonDbError } from '@neondatabase/serverless'
import { insertAnswerAtomic, findCommittedAnswer } from '../lib/game/answer-commit.ts'

function fkViolation(): NeonDbError {
  const err = new NeonDbError('insert or update on table "events" violates foreign key constraint')
  err.code = '23503'
  return err
}

function otherDbError(): NeonDbError {
  const err = new NeonDbError('syntax error or access rule violation')
  err.code = '42601'
  return err
}

// ---- insertAnswerAtomic ----------------------------------------------------

test('insertAnswerAtomic: a row comes back -> inserted, using the caller-supplied student id', async () => {
  const insert = async (studentId: string | null) => {
    assert.equal(studentId, 's_1')
    return [{ id: 42 }]
  }
  const result = await insertAnswerAtomic(insert, 's_1', 'test')
  assert.deepEqual(result, { outcome: 'inserted', studentIdUsed: 's_1' })
})

test('insertAnswerAtomic: "on conflict do nothing" returns zero rows -> conflict, not error', async () => {
  const insert = async () => []
  const result = await insertAnswerAtomic(insert, 's_1', 'test')
  assert.deepEqual(result, { outcome: 'conflict', studentIdUsed: 's_1' })
})

test('insertAnswerAtomic: FK violation on the first attempt retries with a null student id and can still insert', async () => {
  let call = 0
  const insert = async (studentId: string | null) => {
    call += 1
    if (call === 1) {
      assert.equal(studentId, 's_stale')
      throw fkViolation()
    }
    assert.equal(studentId, null)
    return [{ id: 7 }]
  }
  const result = await insertAnswerAtomic(insert, 's_stale', 'test')
  assert.deepEqual(result, { outcome: 'inserted', studentIdUsed: null })
  assert.equal(call, 2)
})

test('insertAnswerAtomic: FK violation, then the null-student retry itself conflicts -> conflict with studentIdUsed null', async () => {
  let call = 0
  const insert = async (studentId: string | null) => {
    call += 1
    if (call === 1) throw fkViolation()
    assert.equal(studentId, null)
    return [] // on conflict do nothing fired on the retry too -- a null-student row for this key already exists
  }
  const result = await insertAnswerAtomic(insert, 's_stale', 'test')
  assert.deepEqual(result, { outcome: 'conflict', studentIdUsed: null })
})

test('insertAnswerAtomic: FK violation, then the retry itself throws -> error, never conflict', async () => {
  let call = 0
  const insert = async () => {
    call += 1
    if (call === 1) throw fkViolation()
    throw new Error('retry insert failed')
  }
  const result = await insertAnswerAtomic(insert, 's_stale', 'test')
  assert.deepEqual(result, { outcome: 'error', studentIdUsed: null })
})

test('insertAnswerAtomic: a non-FK error is "error", not silently folded into "conflict"', async () => {
  const insert = async () => {
    throw otherDbError()
  }
  const result = await insertAnswerAtomic(insert, 's_1', 'test')
  assert.deepEqual(result, { outcome: 'error', studentIdUsed: 's_1' })
})

test('insertAnswerAtomic: a plain (non-NeonDbError) throw is also "error", not retried as an FK case', async () => {
  let call = 0
  const insert = async () => {
    call += 1
    throw new Error('network blip')
  }
  const result = await insertAnswerAtomic(insert, 's_1', 'test')
  assert.deepEqual(result, { outcome: 'error', studentIdUsed: 's_1' })
  assert.equal(call, 1, 'must not retry on a non-FK error')
})

// ---- findCommittedAnswer ----------------------------------------------------

/** Minimal stand-in for the Neon tagged-template sql function: records the
 *  interpolated values it was called with and returns whatever `rows` says. */
function fakeSql(rows: unknown[], onCall?: (values: unknown[]) => void) {
  return (async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    onCall?.(values)
    return rows
  }) as unknown as Parameters<typeof findCommittedAnswer>[0]
}

test('findCommittedAnswer: a matching row reconstructs the recorded result', async () => {
  const sql = fakeSql([{ is_correct: true, points_delta: 20, net_after: 60 }])
  const result = await findCommittedAnswer(sql, 'sess-1', 2, 'item-1', 's_1', 'test')
  assert.deepEqual(result, { isCorrect: true, pointsDelta: 20, netAfter: 60 })
})

test('findCommittedAnswer: no matching row -> null, caller must fall back to a bare rejection', async () => {
  const sql = fakeSql([])
  const result = await findCommittedAnswer(sql, 'sess-1', 2, 'item-1', 's_1', 'test')
  assert.equal(result, null)
})

test('findCommittedAnswer: a query error -> null, never throws', async () => {
  const sql = (async () => {
    throw new Error('connection reset')
  }) as unknown as Parameters<typeof findCommittedAnswer>[0]
  const result = await findCommittedAnswer(sql, 'sess-1', 2, 'item-1', 's_1', 'test')
  assert.equal(result, null)
})

test('findCommittedAnswer: is keyed on studentIdUsed, not some other identity -- lookup is scoped to the id passed in', async () => {
  let seenStudentId: unknown
  const sql = fakeSql([{ is_correct: false, points_delta: -10, net_after: -10 }], (values) => {
    // values are interpolated in template order: sessionId, round, itemId, studentIdUsed.
    seenStudentId = values[3]
  })
  await findCommittedAnswer(sql, 'sess-1', 1, 'item-9', null, 'test')
  assert.equal(seenStudentId, null, 'a null studentIdUsed (FK-retry or unauthenticated) must be looked up as null, not skipped')
})
