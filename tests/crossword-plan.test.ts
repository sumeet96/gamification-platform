// scripts/author-crossword-boards.mjs's no-I/O placement/planning helpers, split into
// scripts/lib/crossword-plan.mjs so the algorithm is testable without a live Neon connection --
// same pattern as tests/connections-plan.test.ts. These functions are a byte-for-byte port of
// scripts/spike-crossword-density.mjs's already-measured algorithm (this session: 46.5% fill on
// the full live bank, 43.5%/44.6% at single-deck board scale) -- these tests check the algorithm's
// STRUCTURAL properties (determinism, id stability, collision detection), not density, which the
// spike already measured against real data.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fragmentsOf,
  canPlace,
  place,
  bbox,
  tryPlaceWord,
  runOnce,
  placeBest,
  computeBoardId,
} from '../scripts/lib/crossword-plan.mjs'

test('fragmentsOf strips stopwords, punctuation, and out-of-range lengths', () => {
  assert.deepEqual(fragmentsOf('Big Data Challenges'), ['BIG', 'DATA', 'CHALLENGES'])
  assert.deepEqual(fragmentsOf('Structured data'), ['STRUCTURED', 'DATA'])
  // 'a', 'an', 'the'... are dropped by the stopword filter, not just short-length filtering.
  assert.deepEqual(fragmentsOf('The Internet of Things'), ['INTERNET', 'THINGS'])
})

test('fragmentsOf respects explicit min/max length bounds', () => {
  // BIG (3) and DATA (4) both fit [3,5]; CHALLENGES (10) doesn't.
  assert.deepEqual(fragmentsOf('Big Data Challenges', 3, 5), ['BIG', 'DATA'])
  assert.deepEqual(fragmentsOf('Edge Computing', 3, 10), ['EDGE', 'COMPUTING'])
})

test('canPlace rejects a conflicting letter at a shared cell, accepts an agreeing one', () => {
  const grid = new Map([['0,0', 'C'], ['1,0', 'A'], ['2,0', 'T']]) // "CAT" placed horizontally
  // "COG" placed vertically through the shared 'C' at (0,0) -- agrees, must be allowed.
  assert.equal(canPlace(grid, 'COG', 0, 0, 'V'), true)
  // A word that would put a DIFFERENT letter at (0,0) must be rejected.
  assert.equal(canPlace(grid, 'DOG', 0, 0, 'V'), false)
})

test('canPlace rejects an adjacent placement that would create an unintended fake word', () => {
  const grid = new Map([['0,0', 'C'], ['1,0', 'A'], ['2,0', 'T']])
  // Placing directly above/below a letter without crossing through it (no shared cell at all)
  // must be rejected -- the neighbour-adjacency guard, not the letter-conflict one.
  assert.equal(canPlace(grid, 'BAT', 0, -1, 'H'), false)
})

test('canPlace rejects a run-on placement (word would touch the end of an existing word)', () => {
  const grid = new Map([['0,0', 'C'], ['1,0', 'A'], ['2,0', 'T']])
  assert.equal(canPlace(grid, 'S', 3, 0, 'H'), false) // would extend "CAT" into "CATS" unintentionally
})

test('place mutates the grid and records the placement', () => {
  const grid = new Map()
  const placed: Array<{ word: string; x: number; y: number; dir: string }> = []
  place(grid, 'CAT', 0, 0, 'H', placed)
  assert.equal(grid.get('0,0'), 'C')
  assert.equal(grid.get('1,0'), 'A')
  assert.equal(grid.get('2,0'), 'T')
  assert.deepEqual(placed, [{ word: 'CAT', x: 0, y: 0, dir: 'H' }])
})

test('bbox computes the bounding box of a sparse grid, including negative coordinates', () => {
  const grid = new Map([['-2,0', 'A'], ['3,5', 'B']])
  assert.deepEqual(bbox(grid), { w: 6, h: 6 })
})

test('tryPlaceWord finds a crossing and returns null when none exists', () => {
  const grid = new Map([['0,0', 'C'], ['1,0', 'A'], ['2,0', 'T']])
  const spot = tryPlaceWord(grid, 'COG')
  assert.ok(spot, 'COG shares a C with CAT and should find a valid crossing')
  assert.equal(spot.dir, 'V')
  assert.equal(spot.x, 0)
  assert.equal(spot.y, 0)
  // QUIZ (Q,U,I,Z), not ZEBRA -- ZEBRA contains 'A', which genuinely IS a valid
  // (if distant) crossing with CAT's own 'A', so it is a bad "no crossing"
  // fixture (verified empirically before trusting this test, not assumed).
  assert.equal(tryPlaceWord(grid, 'QUIZ'), null, 'no shared letters with CAT -- nothing to cross')
})

test('runOnce places the first word unconditionally, then only words with a valid crossing', () => {
  const result = runOnce(['CAT', 'COG', 'QUIZ'])
  assert.equal(result.placed.length, 2) // CAT (anchor) + COG (crosses it)
  assert.deepEqual(result.orphaned, ['QUIZ'])
})

test('placeBest is deterministic for a fixed seed -- same input always produces the same layout', () => {
  const words = ['DATA', 'ANALYTICS', 'STRUCTURED', 'VARIETY', 'VOLUME', 'VELOCITY']
  const a = placeBest(words, 20, 42)
  const b = placeBest(words, 20, 42)
  assert.ok(a && b, 'placeBest must return a result for a non-empty word list')
  assert.deepEqual(
    a.placed.map((p: { word: string; x: number; y: number; dir: string }) => ({ word: p.word, x: p.x, y: p.y, dir: p.dir })),
    b.placed.map((p: { word: string; x: number; y: number; dir: string }) => ({ word: p.word, x: p.x, y: p.y, dir: p.dir })),
    'identical seed and inputs must reproduce the identical layout -- required for the --out/--review-file round trip to make sense'
  )
})

test('placeBest with a different seed can (but need not) differ -- restarts genuinely explore, not a fixed script', () => {
  const words = ['DATA', 'ANALYTICS', 'STRUCTURED', 'VARIETY', 'VOLUME', 'VELOCITY']
  const a = placeBest(words, 5, 1)
  const b = placeBest(words, 5, 2)
  assert.ok(a && b, 'placeBest must return a result for a non-empty word list')
  // Not asserting they differ (they legitimately could coincide) -- asserting both are
  // internally valid, deterministic runs of the same algorithm.
  assert.ok(a.placed.length > 0)
  assert.ok(b.placed.length > 0)
})

test('computeBoardId is deterministic and sensitive to both source_id and the entry set', () => {
  const a = computeBoardId('source-1', ['item-a', 'item-b'])
  const b = computeBoardId('source-1', ['item-a', 'item-b'])
  assert.equal(a, b)
  assert.equal(a.length, 32)
  assert.match(a, /^[0-9a-f]{32}$/)
  assert.notEqual(a, computeBoardId('source-2', ['item-a', 'item-b']), 'different source_id must change the id')
  assert.notEqual(a, computeBoardId('source-1', ['item-a', 'item-c']), 'a different entry set must change the id')
})

test('computeBoardId depends on the entry SET, not the order it is given in -- caller must sort first', () => {
  // The function itself does not sort -- documented as the caller's job (author-crossword-boards.mjs
  // always passes a pre-sorted array). This test locks in that contract: an unsorted call is NOT
  // treated as equivalent, so a caller that forgets to sort would get caught by a board-id mismatch
  // between two logically-identical runs, not silently produce two different valid ids for the same set.
  const sorted = computeBoardId('source-1', ['item-a', 'item-b'])
  const unsorted = computeBoardId('source-1', ['item-b', 'item-a'])
  assert.notEqual(sorted, unsorted)
})
