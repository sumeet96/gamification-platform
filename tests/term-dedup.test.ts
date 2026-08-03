// build-term-mcq-spike.mjs's --from-json path dedups the same concept across independently
// generated decks (found live: the CAGE/Thoughtworks decks produced "Minimum Viable Products
// (MVPs)" and "Minimum Viable Product (MVP)" as two strings for one concept). These tests pin the
// normaliser's exact behaviour so a future tweak can't silently start merging distinct concepts or
// stop merging the ones it was written for.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normaliseTermKey } from '../scripts/lib/term-dedup.mjs'

test('the live MVP pair collides', () => {
  assert.equal(
    normaliseTermKey('Minimum Viable Products (MVPs)'),
    normaliseTermKey('Minimum Viable Product (MVP)'),
  )
})

test('a parenthetical suffix is stripped', () => {
  assert.equal(normaliseTermKey('Extreme Programming (XP)'), normaliseTermKey('Extreme Programming'))
})

test('a trailing plural is stripped', () => {
  assert.equal(normaliseTermKey('Story Walls'), normaliseTermKey('Story Wall'))
})

test('two genuinely different concepts do not collide', () => {
  assert.notEqual(normaliseTermKey('Release Wall'), normaliseTermKey('Product Wall'))
  assert.notEqual(normaliseTermKey('Agile Software Development'), normaliseTermKey('Waterfall Software Development'))
})
