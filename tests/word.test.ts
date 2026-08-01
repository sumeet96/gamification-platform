// Package A3: pure choose-the-right-word logic (lib/games/word.ts) -- which
// strings an item's options could ever have been, and the option-membership
// check app/api/word/answer/route.ts uses to 400 a fabricated submission
// before it ever reaches scoring.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_DISTRACTORS, isOfferedOption, itemOptions } from '../lib/games/word.ts'
import { matchesTerm } from '../lib/games/match.ts'

test('itemOptions puts the term first, then up to MAX_DISTRACTORS distractors', () => {
  const opts = itemOptions('Term', ['D1', 'D2', 'D3', 'D4', 'D5'])
  assert.equal(opts.length, 1 + MAX_DISTRACTORS)
  assert.equal(opts[0], 'Term')
  assert.deepEqual(opts.slice(1), ['D1', 'D2', 'D3'])
})

test('itemOptions never invents distractors when fewer than 3 exist', () => {
  assert.deepEqual(itemOptions('Term', ['D1']), ['Term', 'D1'])
  assert.deepEqual(itemOptions('Term', []), ['Term'])
})

test('isOfferedOption accepts the term and any offered distractor', () => {
  assert.ok(isOfferedOption('Term', 'Term', ['D1', 'D2', 'D3']))
  assert.ok(isOfferedOption('D2', 'Term', ['D1', 'D2', 'D3']))
})

test('isOfferedOption rejects a distractor beyond the first MAX_DISTRACTORS', () => {
  assert.ok(!isOfferedOption('D4', 'Term', ['D1', 'D2', 'D3', 'D4']))
})

test('isOfferedOption rejects an arbitrary fabricated string', () => {
  assert.ok(!isOfferedOption('something the client made up', 'Term', ['D1', 'D2', 'D3']))
})

test('isOfferedOption is exact-string membership, not the normalised comparison scoring uses', () => {
  // "term" would satisfy matchesTerm's normalisation against "Term", but it is
  // not a literal string the question route could have returned, so membership
  // must reject it even though scoring would have accepted it.
  assert.ok(!isOfferedOption('term', 'Term', ['D1', 'D2', 'D3']))
  assert.ok(matchesTerm('term', { itemId: 'x', clue: 'c', term: 'Term', variants: [] }))
})
