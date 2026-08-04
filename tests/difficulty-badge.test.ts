// Fixes the "Level N" badge rendering on every game even though nothing is
// currently difficulty-calibrated (match and quiz never gated it; word
// already did). Two things are covered here:
//
// 1. parseDifficultyHonored (lib/games/item-select.ts) -- the defensive parse
//    match's page now uses on GET /api/match/board's JSON response, same
//    convention word's page already had inline. A missing field, a
//    non-boolean value, and an explicit `false` must all resolve to "hidden,"
//    never a client-side guess -- this is exactly the seam that shipped the
//    original A3 badge bug (a value computed server-side, never consumed
//    correctly client-side).
//
// 2. pickQuestion's difficultyHonored (lib/game/questions.ts) -- the quiz has
//    no per-question server route (selection is client-side against the pool
//    from /api/questions), so there is no JSON field to parse; the same
//    MIN_CALIBRATED_FOR_DIFFICULTY floor word/question's route uses is
//    reproduced here directly against the unused pool.
//
// app/api/match/board/route.ts's response shape can't be exercised directly
// (it needs a live Neon connection and a session, and node's native test
// runner does not resolve the "@/*" alias the route file uses -- same
// limitation tests/item-retirement.test.ts documents) -- so that half is a
// source-text check, the same pattern that file already established.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseDifficultyHonored } from '../lib/games/item-select.ts'
import { pickQuestion, type Question } from '../lib/game/questions.ts'

// ---- parseDifficultyHonored -----------------------------------------------

test('parseDifficultyHonored: an explicit true is honoured', () => {
  assert.equal(parseDifficultyHonored(true), true)
})

test('parseDifficultyHonored: an explicit false is not honoured', () => {
  assert.equal(parseDifficultyHonored(false), false)
})

test('parseDifficultyHonored: a missing field (undefined) is not honoured', () => {
  assert.equal(parseDifficultyHonored(undefined), false)
})

test('parseDifficultyHonored: a non-boolean value is never coerced to honoured', () => {
  assert.equal(parseDifficultyHonored('true'), false)
  assert.equal(parseDifficultyHonored(1), false)
  assert.equal(parseDifficultyHonored(null), false)
})

// ---- pickQuestion's difficultyHonored --------------------------------------

function poolOf(n: number, difficulty: 1 | 2 | 3 | 4 | 5 | null): Question[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q-${i}`,
    difficulty,
    stem: `stem ${i}`,
    options: ['a', 'b', 'c', 'd'],
  }))
}

test('pickQuestion: fewer than 20 calibrated items in the unused pool never claims difficultyHonored, even though it still ranks by difficulty', () => {
  // 17 calibrated items -- the CAGE deck's real live count as of this fix --
  // is below the floor, matching word/question route's MIN_CALIBRATED_FOR_DIFFICULTY.
  const pool = poolOf(17, 3)
  const picked = pickQuestion(pool, 3, new Set())
  assert.ok(picked)
  assert.equal(picked!.difficultyHonored, false, 'below the calibrated floor, must not claim honoured')
  assert.equal(picked!.question.difficulty, 3, 'still picks the closest calibrated item -- the floor only gates the badge claim, not selection')
})

test('pickQuestion: at least 20 calibrated items in the unused pool claims difficultyHonored', () => {
  const pool = poolOf(20, 3)
  const picked = pickQuestion(pool, 3, new Set())
  assert.ok(picked)
  assert.equal(picked!.difficultyHonored, true)
})

test('pickQuestion: zero calibrated items never claims difficultyHonored', () => {
  const pool = poolOf(25, null)
  const picked = pickQuestion(pool, 3, new Set())
  assert.ok(picked)
  assert.equal(picked!.difficultyHonored, false)
})

test('pickQuestion: an empty unused pool returns null, not a false claim', () => {
  const pool = poolOf(20, 3)
  const used = new Set(pool.map((q) => q.id))
  assert.equal(pickQuestion(pool, 3, used), null)
})

// ---- app/api/match/board/route.ts response shape ---------------------------

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (rel: string) => readFileSync(root + rel, 'utf8')

test('app/api/match/board/route.ts sends difficultyHonored in its response, not just into the board token', () => {
  const src = read('app/api/match/board/route.ts')
  const responseLine = src.slice(src.lastIndexOf('return Response.json('))
  assert.ok(
    responseLine.includes('difficultyHonored'),
    'the board response must carry difficultyHonored so the page can gate its Level N badge on it'
  )
})
