// Package A3: the shared least-recently-served + difficulty-tiebreak ranking
// (lib/games/item-select.ts), generalised out of lib/games/match-board-select.ts
// so choose-the-right-word can reuse it. tests/match-board.test.ts already covers
// this ranking indirectly through selectBoard's subject-grouping wrapper; these
// tests drive selectItems directly, including the no-subject-concept case
// choose-the-right-word actually needs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectItems, shuffle, type RankableRow } from '../lib/games/item-select.ts'

interface Row extends RankableRow {
  id: string
  difficulty: number | null
}

function rows(n: number, difficulty: number | null = null): Row[] {
  return Array.from({ length: n }, (_, i) => ({ id: `r-${i}`, difficulty }))
}

test('fewer candidates than count: returns null (caller returns 409)', () => {
  assert.equal(selectItems(rows(2), new Map(), null, 5), null)
})

test('exactly count candidates: all are returned regardless of history', () => {
  const r = rows(3)
  const selection = selectItems(r, new Map(), null, 3)
  assert.ok(selection)
  assert.equal(selection!.rows.length, 3)
  assert.deepEqual(new Set(selection!.rows.map((x) => x.id)), new Set(r.map((x) => x.id)))
})

test('never-served items are always preferred over previously served ones', () => {
  const r = rows(5)
  const lastSeen = new Map([['r-0', 1_000]])
  const selection = selectItems(r, lastSeen, null, 4)
  assert.ok(selection)
  assert.equal(selection!.rows.length, 4)
  assert.ok(
    !selection!.rows.some((x) => x.id === 'r-0'),
    'the one served item must be dropped while never-served items exist'
  )
})

test('among served items, the oldest-served is preferred (least-recently-served kept)', () => {
  const r = rows(4)
  const lastSeen = new Map(r.map((x, i) => [x.id, (i + 1) * 1_000]))
  const selection = selectItems(r, lastSeen, null, 3)
  assert.ok(selection)
  const kept = new Set(selection!.rows.map((x) => x.id))
  assert.equal(kept.size, 3)
  assert.ok(!kept.has('r-3'), 'the most-recently-served item must be pushed out first')
})

test('a fully-saturated pool (every item already served) still returns a full selection, never null', () => {
  const r = rows(3)
  const lastSeen = new Map(r.map((x, i) => [x.id, (i + 1) * 1_000]))
  const selection = selectItems(r, lastSeen, null, 3)
  assert.ok(selection, 'a saturated pool must still produce a selection')
  assert.equal(selection!.rows.length, 3)
})

test('with no calibrated rows, selection falls back and does not claim difficultyHonored', () => {
  const r = rows(5, null)
  const selection = selectItems(r, new Map(), 3, 3)
  assert.ok(selection)
  assert.equal(selection!.difficultyHonored, false)
})

test('with a target difficulty but only SOME rows calibrated (fewer than count), falls back honestly', () => {
  const r = [...rows(2, 3), ...rows(2, null)]
  const selection = selectItems(r, new Map(), 3, 3)
  assert.ok(selection)
  assert.equal(selection!.difficultyHonored, false, 'only 2 calibrated rows exist, fewer than count')
})

test('no target difficulty requested: never claims difficultyHonored even with fully calibrated data', () => {
  const r = rows(5, 3)
  const selection = selectItems(r, new Map(), null, 3)
  assert.ok(selection)
  assert.equal(selection!.difficultyHonored, false, 'no preference was requested')
})

test('with enough calibrated rows, ranks by distance to target and honours the claim', () => {
  // FIX 4 regression: the farthest-from-target row (d4) is listed FIRST here,
  // not last. With the old -Infinity sentinel, comparing two never-served
  // rows produced NaN and sort() silently fell back to raw array order, so
  // this exact fixture used to keep d4 (only because it happened to sit
  // last) and drop d3 instead, while still reporting difficultyHonored: true.
  // Reordering it is the only way this test actually proves the ranking
  // works rather than an accident of fixture order.
  const r: Row[] = [
    { id: 'd4', difficulty: 5 },
    { id: 'd1', difficulty: 1 },
    { id: 'd2', difficulty: 2 },
    { id: 'd3', difficulty: 3 },
  ]
  const selection = selectItems(r, new Map(), 2, 3)
  assert.ok(selection)
  assert.equal(selection!.difficultyHonored, true)
  const kept = new Set(selection!.rows.map((x) => x.id))
  assert.ok(!kept.has('d4'), 'the farthest-from-target row must be the one dropped')
  assert.ok(kept.has('d3'), 'd3 (distance 1) must be kept over d4 (distance 3), not the reverse')
})

test('FIX 4: the difficulty tiebreak among MULTIPLE never-served rows is not dead (regression for the -Infinity/NaN bug)', () => {
  // All rows are never-served (empty lastSeen), so recency ties everything
  // and difficulty distance must be the sole tiebreaker. Before FIX 4,
  // recencyKey(a) - recencyKey(b) was -Infinity - -Infinity === NaN for
  // every pair here; a NaN comparator result never reaches the difficulty
  // branch, so sort() left the array in raw, unranked order regardless of
  // difficulty distance.
  const r: Row[] = [
    { id: 'far', difficulty: 5 },
    { id: 'near', difficulty: 2 },
    { id: 'mid', difficulty: 3 },
  ]
  const selection = selectItems(r, new Map(), 2, 2)
  assert.ok(selection)
  assert.equal(selection!.difficultyHonored, true)
  const kept = new Set(selection!.rows.map((x) => x.id))
  assert.ok(kept.has('near') && kept.has('mid'), 'the two closest-to-target rows must be kept')
  assert.ok(!kept.has('far'), 'the farthest row must be dropped even though it was never served')
})

test('FIX 3: a single calibrated row is not enough to honour difficulty when minCalibrated is set', () => {
  // Mirrors app/api/word/question/route.ts's real call shape: count=1, so the
  // old `calibrated.length >= count` guard alone would be satisfied by this
  // ONE calibrated row. minCalibrated raises that bar independently of count.
  const r: Row[] = [
    { id: 'only-calibrated', difficulty: 3 },
    { id: 'uncalibrated-1', difficulty: null },
    { id: 'uncalibrated-2', difficulty: null },
  ]
  const selection = selectItems(r, new Map(), 3, 1, Math.random, 20)
  assert.ok(selection)
  assert.equal(selection!.difficultyHonored, false, 'one calibrated row must not clear a minCalibrated of 20')
})

test('FIX 3: minCalibrated defaults to 0, so existing callers (match) that omit it are unaffected', () => {
  const r: Row[] = [
    { id: 'd1', difficulty: 3 },
    { id: 'd2', difficulty: 3 },
  ]
  const selection = selectItems(r, new Map(), 3, 2)
  assert.ok(selection)
  assert.equal(selection!.difficultyHonored, true, 'omitting minCalibrated must preserve the old count-only guard')
})

test('recency wins over difficulty; difficulty only breaks ties among equally-recent rows', () => {
  const r: Row[] = [
    { id: 'd1', difficulty: 2 }, // closest to target but served
    { id: 'd2', difficulty: 2 },
    { id: 'd3', difficulty: 2 },
    { id: 'd4', difficulty: 5 }, // farthest from target, never served
  ]
  const lastSeen = new Map([['d1', 1_000]])
  const selection = selectItems(r, lastSeen, 2, 3)
  assert.ok(selection)
  assert.equal(selection!.difficultyHonored, true)
  const kept = new Set(selection!.rows.map((x) => x.id))
  assert.ok(kept.has('d4'), 'never-served must outrank a closer-difficulty item that was already served')
  assert.ok(!kept.has('d1'), 'the only served item is dropped when it would otherwise be a full house')
})

test('a single-item selection (count 1) returns exactly one row', () => {
  const r = rows(10)
  const selection = selectItems(r, new Map(), null, 1)
  assert.ok(selection)
  assert.equal(selection!.rows.length, 1)
})

test('shuffle is a permutation regardless of the RNG', () => {
  const items = [1, 2, 3, 4, 5]
  const shuffled = shuffle(items, () => 0.5)
  assert.equal(shuffled.length, items.length)
  assert.deepEqual([...shuffled].sort(), [...items].sort())
})
