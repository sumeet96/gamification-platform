// Package G2 follow-up (3 Aug 2026): example-missing-term used to REJECT the whole item — on the
// last verified 18-page run that killed 2 of 5 drafts for a field only fill-in-the-blanks (not
// yet built) reads. Same shape of over-rejection CLAUDE.md already names once (G2's clue-leak
// rule killing 5 of 8 valid items). Fix: sanitizeExampleSentences nulls the doomed field BEFORE
// terms-validate.mjs's mandatory pass, instead of terms-validate.mjs rejecting the item outright.
// terms-validate.mjs itself is untouched — these tests prove the interaction between the two
// modules, not just sanitizeExampleSentences in isolation, since that interaction (does a second,
// unrelated defect still surface once the example is nulled and the ordered pipeline keeps
// running?) is the part most likely to regress silently.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeExampleSentences, EXAMPLE_MAX_CHARS } from '../scripts/lib/terms-example-sanitize.mjs'
import { validateTerms } from '../scripts/lib/terms-validate.mjs'

/** Minimal valid item shape, overridden per test. Matches what generate-terms.mjs writes. */
function makeItem(overrides = {}) {
  return {
    topic: 'test',
    cognitive_level: 'recall',
    term: 'Term',
    clue: 'A clue that does not mention the term.',
    example_sentence: null,
    variants: [],
    distractors: ['Distractor One', 'Distractor Two'],
    page: 1,
    ...overrides,
  }
}

test('example-missing-term alone: sanitize nulls the field, item then passes validateTerms', () => {
  const item = makeItem({
    term: 'Network Effects',
    example_sentence: 'This platform gets more valuable as more people join it.', // no "network effects"
  })
  const { nulledForMissingTerm, nulledForLength } = sanitizeExampleSentences([item])
  assert.equal(nulledForMissingTerm, 1)
  assert.equal(nulledForLength, 0)
  assert.equal(item.example_sentence, null)

  const { passed, rejected } = validateTerms([item])
  assert.equal(rejected.length, 0)
  assert.equal(passed.length, 1)
})

test('example-missing-term plus a second defect: still rejected, on the other rule', () => {
  // The example is missing the term (would trip example-missing-term), AND the clue leaks the
  // term outright (would trip clue-leaks-term). Before this fix, only example-missing-term would
  // ever be seen (it runs earlier is irrelevant here — the point is BOTH defects exist and the
  // item must not slip through just because one of them is now excused).
  const item = makeItem({
    term: 'Network Effects',
    clue: 'Network effects describe a product that gets better as more people use it.',
    example_sentence: 'This platform gets more valuable as more people join it.',
  })
  sanitizeExampleSentences([item])
  assert.equal(item.example_sentence, null, 'the missing-term defect is still excused')

  const { passed, rejected } = validateTerms([item])
  assert.equal(passed.length, 0)
  assert.equal(rejected.length, 1)
  assert.equal(rejected[0].rule, 'clue-leaks-term')
})

test('a valid example (contains the term, one normal-length line) survives untouched', () => {
  const item = makeItem({
    term: 'Network Effects',
    example_sentence: 'Network effects made the marketplace hard for a new entrant to challenge.',
  })
  const before = item.example_sentence
  const { nulledForMissingTerm, nulledForLength } = sanitizeExampleSentences([item])
  assert.equal(nulledForMissingTerm, 0)
  assert.equal(nulledForLength, 0)
  assert.equal(item.example_sentence, before)
})

test('a multi-line example (slide dump) is nulled even though it contains the term', () => {
  const item = makeItem({
    term: 'Timeline',
    example_sentence: 'Timeline of key events:\n2007 launch\n2011 international\n2013 originals\n2015 4K\n2020 games',
  })
  const { nulledForLength, nulledForMissingTerm } = sanitizeExampleSentences([item])
  assert.equal(nulledForLength, 1)
  assert.equal(nulledForMissingTerm, 0)
  assert.equal(item.example_sentence, null)
})

test('an over-long single-line example is nulled on length, not on missing-term', () => {
  const term = 'Network Effects'
  const long = `Network Effects ${'x'.repeat(EXAMPLE_MAX_CHARS)}`
  assert.ok(long.length > EXAMPLE_MAX_CHARS)
  const item = makeItem({ term, example_sentence: long })
  const { nulledForLength, nulledForMissingTerm } = sanitizeExampleSentences([item])
  assert.equal(nulledForLength, 1)
  assert.equal(nulledForMissingTerm, 0)
  assert.equal(item.example_sentence, null)
})

test('a short single-line example within the threshold is left alone on length grounds', () => {
  const item = makeItem({
    term: 'Network Effects',
    example_sentence: `Network effects: ${'x'.repeat(EXAMPLE_MAX_CHARS - 30)}`,
  })
  assert.ok((item.example_sentence ?? '').length <= EXAMPLE_MAX_CHARS)
  const { nulledForLength } = sanitizeExampleSentences([item])
  assert.equal(nulledForLength, 0)
})

test('null example_sentence is left alone (nothing to sanitize)', () => {
  const item = makeItem({ term: 'Network Effects', example_sentence: null })
  const { nulledForLength, nulledForMissingTerm } = sanitizeExampleSentences([item])
  assert.equal(nulledForLength, 0)
  assert.equal(nulledForMissingTerm, 0)
  assert.equal(item.example_sentence, null)
})

test('log-count bookkeeping: two items nulled for two different reasons are counted separately', () => {
  const missingTermItem = makeItem({
    term: 'Network Effects',
    example_sentence: 'This platform gets more valuable as more people join it.',
  })
  const multilineItem = makeItem({
    term: 'Timeline',
    example_sentence: 'Timeline of key events:\n2007 launch\n2011 international',
  })
  const untouchedItem = makeItem({
    term: 'Network Effects',
    example_sentence: 'Network effects made the marketplace hard for a new entrant to challenge.',
  })
  const { nulledForLength, nulledForMissingTerm } = sanitizeExampleSentences([
    missingTermItem, multilineItem, untouchedItem,
  ])
  assert.equal(nulledForMissingTerm, 1)
  assert.equal(nulledForLength, 1)
  assert.equal(untouchedItem.example_sentence !== null, true)
})
