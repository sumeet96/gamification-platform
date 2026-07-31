// Package A1 rework: pure board-selection logic (app/api/match/board/route.ts
// via lib/games/match-board-select.ts). Covers the defects that motivated
// splitting this out -- FIX 7 (never claim an unhonoured difficulty), FIX 8
// (a board never spans two subjects) -- plus the least-recently-served
// ranking that replaced the old hard exclusion (app/api/match/board/route.ts
// header has the full story: hard exclusion keyed on a student's whole
// history starved them permanently after ~8 boards) -- with fixtures instead
// of a live Neon connection.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectBoard, shuffle, type EligibleRow } from '../lib/games/match-board-select.ts'

const BOARD_SIZE = 6

/** `n` rows for one subject, ids `${subject}-0`.. `${subject}-{n-1}`, all
 *  difficulty null unless `difficulty` is supplied. */
function rowsFor(subject: string, n: number, difficulty: number | null = null): EligibleRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${subject}-${i}`,
    term: `${subject} term ${i}`,
    clue: `${subject} clue ${i}`,
    subject,
    difficulty,
  }))
}

test('a board never mixes subjects (FIX 8): all six rows come from the same subject', () => {
  const rows = [...rowsFor('IM', 8), ...rowsFor('DT', 8)]
  const selection = selectBoard(rows, new Map(), null, BOARD_SIZE, () => 0)
  assert.ok(selection)
  assert.equal(selection!.rows.length, BOARD_SIZE)
  const subjects = new Set(selection!.rows.map((r) => r.subject))
  assert.equal(subjects.size, 1)
  assert.ok(subjects.has(selection!.subject))
})

test('a subject with fewer than boardSize eligible rows is never chosen', () => {
  // IM has only 3 rows -- never enough on its own -- DT has 8.
  const rows = [...rowsFor('IM', 3), ...rowsFor('DT', 8)]
  // Force "random" selection to always prefer index 0 if it were offered a
  // choice; since only DT qualifies, IM must never appear regardless.
  for (let i = 0; i < 5; i++) {
    const selection = selectBoard(rows, new Map(), null, BOARD_SIZE, () => i / 5)
    assert.ok(selection)
    assert.equal(selection!.subject, 'DT')
  }
})

test('no subject has enough rows: selectBoard returns null (caller returns 409)', () => {
  const rows = [...rowsFor('IM', 3), ...rowsFor('DT', 5)]
  assert.equal(selectBoard(rows, new Map(), null, BOARD_SIZE), null)
})

test('LRS: never-served items are always preferred over previously served ones', () => {
  // 8 rows: 2 served (with a lastSeen entry), 6 never-served. Only enough
  // room for BOARD_SIZE (6), so the served two must be the ones left out.
  const rows = rowsFor('DT', 8)
  const lastSeen = new Map([
    ['DT-0', 1_000],
    ['DT-1', 2_000],
  ])
  const selection = selectBoard(rows, lastSeen, null, BOARD_SIZE)
  assert.ok(selection)
  assert.equal(selection!.rows.length, BOARD_SIZE)
  const keptIds = new Set(selection!.rows.map((r) => r.id))
  assert.ok(!keptIds.has('DT-0'), 'a served item must not be picked while never-served items exist')
  assert.ok(!keptIds.has('DT-1'), 'a served item must not be picked while never-served items exist')
})

test('LRS: among served items, the oldest-served are preferred', () => {
  // All 8 rows served, with distinct lastSeen timestamps. The 6 OLDEST
  // (smallest timestamp) must be kept; the 2 most-recently-served left out.
  const rows = rowsFor('DT', 8)
  const lastSeen = new Map(rows.map((r, i) => [r.id, (i + 1) * 1_000]))
  const selection = selectBoard(rows, lastSeen, null, BOARD_SIZE)
  assert.ok(selection)
  const keptIds = new Set(selection!.rows.map((r) => r.id))
  assert.equal(keptIds.size, BOARD_SIZE)
  // DT-6 and DT-7 carry the two largest (most recent) timestamps.
  assert.ok(!keptIds.has('DT-6'), 'the most-recently-served item must be pushed out first')
  assert.ok(!keptIds.has('DT-7'), 'the most-recently-served item must be pushed out first')
})

test('LRS: a fully-saturated student (every item in the pool already served) still gets a board, never a 409', () => {
  // Exactly BOARD_SIZE rows, ALL served -- the old whole-history exclusion
  // would drop every one of these and return null (409). The new ranking
  // must still hand back a full board.
  const rows = rowsFor('DT', BOARD_SIZE)
  const lastSeen = new Map(rows.map((r, i) => [r.id, (i + 1) * 1_000]))
  const selection = selectBoard(rows, lastSeen, null, BOARD_SIZE)
  assert.ok(selection, 'a saturated student must still receive a playable board')
  assert.equal(selection!.rows.length, BOARD_SIZE)
  assert.deepEqual(
    new Set(selection!.rows.map((r) => r.id)),
    new Set(rows.map((r) => r.id)),
    'with exactly boardSize rows, every one of them must be served regardless of history'
  )
})

test('FIX 7: with no calibrated (non-null difficulty) rows, selection falls back and says so', () => {
  const rows = rowsFor('DT', 8, null) // every row difficulty: null, like the real data today
  const selection = selectBoard(rows, new Map(), 3, BOARD_SIZE)
  assert.ok(selection)
  assert.equal(selection!.difficultyHonored, false, 'must not claim a difficulty that was never honoured')
  assert.equal(selection!.rows.length, BOARD_SIZE)
})

test('FIX 7: no preference requested (targetDifficulty null) never claims difficultyHonored', () => {
  const rows = rowsFor('DT', 8, 3) // even fully calibrated data
  const selection = selectBoard(rows, new Map(), null, BOARD_SIZE)
  assert.ok(selection)
  assert.equal(selection!.difficultyHonored, false, 'no preference was requested, so nothing was honoured')
})

test('FIX 7: with enough calibrated rows, selection ranks by distance and honours the claim', () => {
  const rows: EligibleRow[] = [
    { id: 'd1', term: 't1', clue: 'c1', subject: 'DT', difficulty: 1 },
    { id: 'd2', term: 't2', clue: 'c2', subject: 'DT', difficulty: 2 },
    { id: 'd3', term: 't3', clue: 'c3', subject: 'DT', difficulty: 3 },
    { id: 'd4', term: 't4', clue: 'c4', subject: 'DT', difficulty: 3 },
    { id: 'd5', term: 't5', clue: 'c5', subject: 'DT', difficulty: 4 },
    { id: 'd6', term: 't6', clue: 'c6', subject: 'DT', difficulty: 5 },
    { id: 'd7', term: 't7', clue: 'c7', subject: 'DT', difficulty: 5 },
  ]
  // None served, so recency ties everything -- difficulty distance decides.
  const selection = selectBoard(rows, new Map(), 3, BOARD_SIZE)
  assert.ok(selection)
  assert.equal(selection!.difficultyHonored, true)
  assert.equal(selection!.rows.length, BOARD_SIZE)
  // The two farthest-from-3 rows (the two difficulty-5s) must be the ones
  // excluded -- only ONE of the two "d6"/"d7" (both distance 2, tied with
  // nothing closer left after the six closest are taken) is dropped since
  // there are 7 candidates and 6 slots; the single dropped row must have the
  // largest distance-from-target among the seven.
  const keptIds = new Set(selection!.rows.map((r) => r.id))
  assert.equal(keptIds.size, BOARD_SIZE)
  const droppedId = rows.map((r) => r.id).find((id) => !keptIds.has(id))
  assert.ok(droppedId === 'd6' || droppedId === 'd7', `expected a distance-2 row dropped, got ${droppedId}`)
})

test('FIX 7: a subject with SOME but fewer than boardSize calibrated rows still falls back honestly', () => {
  const rows = [...rowsFor('DT', 4, 3), ...rowsFor('DT', 4, null).map((r, i) => ({ ...r, id: `DT-null-${i}` }))]
  const selection = selectBoard(rows, new Map(), 3, BOARD_SIZE)
  assert.ok(selection)
  assert.equal(selection!.difficultyHonored, false, 'only 4 calibrated rows exist, fewer than boardSize')
})

test('recency (LRS) and difficulty preference compose: recency wins, difficulty only breaks ties', () => {
  // 7 calibrated rows, enough to honour difficulty (>= BOARD_SIZE). d7 is
  // farthest from target 3 but has NEVER been served; d1 is closest to
  // target but was served recently. LRS must still keep d7 over d1.
  const rows: EligibleRow[] = [
    { id: 'd1', term: 't1', clue: 'c1', subject: 'DT', difficulty: 3 },
    { id: 'd2', term: 't2', clue: 'c2', subject: 'DT', difficulty: 3 },
    { id: 'd3', term: 't3', clue: 'c3', subject: 'DT', difficulty: 3 },
    { id: 'd4', term: 't4', clue: 'c4', subject: 'DT', difficulty: 3 },
    { id: 'd5', term: 't5', clue: 'c5', subject: 'DT', difficulty: 3 },
    { id: 'd6', term: 't6', clue: 'c6', subject: 'DT', difficulty: 3 },
    { id: 'd7', term: 't7', clue: 'c7', subject: 'DT', difficulty: 5 },
  ]
  const lastSeen = new Map([['d1', 1_000]])
  const selection = selectBoard(rows, lastSeen, 3, BOARD_SIZE)
  assert.ok(selection)
  assert.equal(selection!.difficultyHonored, true)
  const keptIds = new Set(selection!.rows.map((r) => r.id))
  assert.ok(keptIds.has('d7'), 'never-served must outrank a closer-difficulty item that was already served')
  assert.ok(!keptIds.has('d1'), 'the only served item must be the one dropped when it is otherwise a full house')
})

test('shuffle is a permutation (same multiset, same length) regardless of the RNG', () => {
  const items = [1, 2, 3, 4, 5, 6]
  const shuffled = shuffle(items, () => 0.999999)
  assert.equal(shuffled.length, items.length)
  assert.deepEqual([...shuffled].sort(), [...items].sort())
})

test('shuffle with a constant-zero RNG is deterministic and reproducible', () => {
  const items = ['a', 'b', 'c', 'd']
  const first = shuffle(items, () => 0)
  const second = shuffle(items, () => 0)
  assert.deepEqual(first, second)
})
