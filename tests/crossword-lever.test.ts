// Package A6, time-lever slice (8 Aug 2026): tests for
// lib/games/crossword-lever.ts's resolveCrosswordTimeWindowSeconds -- the one
// function that reconstructs a student's crossword LeverState from event
// history and resolves it into the full-bonus time window both
// app/api/crossword/board/route.ts (display) and app/api/crossword/submit/
// route.ts (authoritative) call. Same fakeSql pattern as
// tests/answer-commit.test.ts's findCommittedAnswer tests.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCrosswordTimeWindowSeconds } from '../lib/games/crossword-lever.ts'
import { GRID_TIME_BASE, GRID_TIME_STEP } from '../lib/game/engine.ts'

/** Minimal stand-in for the Neon tagged-template sql function: records the
 *  interpolated values it was called with and returns whatever `rows` says.
 *  Mirrors tests/answer-commit.test.ts's fakeSql exactly. */
function fakeSql(rows: unknown[], onCall?: (values: unknown[]) => void) {
  return (async (_strings: TemplateStringsArray, ...values: unknown[]) => {
    onCall?.(values)
    return rows
  }) as unknown as Parameters<typeof resolveCrosswordTimeWindowSeconds>[0]
}

function throwingSql() {
  return (async () => {
    throw new Error('connection reset')
  }) as unknown as Parameters<typeof resolveCrosswordTimeWindowSeconds>[0]
}

test('resolveCrosswordTimeWindowSeconds: no prior history resolves to the base window', async () => {
  const sql = fakeSql([])
  const window = await resolveCrosswordTimeWindowSeconds(sql, 's_1', 'test')
  assert.equal(window, GRID_TIME_BASE)
})

test('resolveCrosswordTimeWindowSeconds: a DB error fails OPEN to the base window, never throws', async () => {
  const sql = throwingSql()
  const window = await resolveCrosswordTimeWindowSeconds(sql, 's_1', 'test')
  assert.equal(window, GRID_TIME_BASE)
})

// The query returns most-recent-first (order by id desc); the function must
// REVERSE before folding, since advanceLeverState is order-sensitive. This
// row set is constructed so a bug that forgets to reverse produces a
// DIFFERENT (wrong) answer than the correct one -- see the inline math.
test('resolveCrosswordTimeWindowSeconds: history is folded oldest-first, not in raw DB (most-recent-first) order', async () => {
  // DB order (most-recent-first): fail, success, success.
  // Correctly reversed to oldest-first: success, success, fail.
  //   fold: streak 0 -> 1 (success) -> 2 (success) -> 0 (fail resets it)
  //   -> final streak 0 -> full base window.
  // If NOT reversed (bug: folded as fail, success, success):
  //   fold: streak 0 -> 0 (fail, no-op at streak 0) -> 1 -> 2
  //   -> final streak 2 -> base - 2*STEP (tighter window).
  const fail = { entries_correct: 2, entries_wrong: 3, entries_not_attempted: 5 } // 2*2=4, not > 10 -> not a success
  const success = { entries_correct: 8, entries_wrong: 1, entries_not_attempted: 1 } // 8*2=16 > 10 -> success
  const sql = fakeSql([fail, success, success])
  const window = await resolveCrosswordTimeWindowSeconds(sql, 's_1', 'test')
  assert.equal(window, GRID_TIME_BASE, 'a history ending in a fail (most recent) must reset the streak to 0')
  assert.notEqual(window, GRID_TIME_BASE - 2 * GRID_TIME_STEP, 'must not match the un-reversed (buggy) fold')
})

test('resolveCrosswordTimeWindowSeconds: a streak of successes tightens the window below the base', async () => {
  const success = { entries_correct: 8, entries_wrong: 1, entries_not_attempted: 1 }
  // DB order (most-recent-first) of three straight successes -- reversal
  // doesn't matter here since all three rows are identical, but this still
  // exercises the "successes actually move the streak" path end to end.
  const sql = fakeSql([success, success, success])
  const window = await resolveCrosswordTimeWindowSeconds(sql, 's_1', 'test')
  assert.equal(window, GRID_TIME_BASE - 3 * GRID_TIME_STEP)
  assert.ok(window < GRID_TIME_BASE)
})

test('resolveCrosswordTimeWindowSeconds: is scoped to the given studentId', async () => {
  let seenStudentId: unknown
  const sql = fakeSql([], (values) => {
    seenStudentId = values.find((v) => v === 's_specific')
  })
  await resolveCrosswordTimeWindowSeconds(sql, 's_specific', 'test')
  assert.equal(seenStudentId, 's_specific')
})
