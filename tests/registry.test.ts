// Package K-2: the game registry is the single source of truth for what
// games exist and how they score. These tests guard the invariants other
// packages build on — a silent hole here (a duplicate id, a positive
// penalty, an undefined lookup) would corrupt points or logging downstream.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GAME_REGISTRY, getGame } from '../lib/games/registry.ts'

test('every entry has a non-empty id, displayName, and legal primitive', () => {
  for (const g of GAME_REGISTRY) {
    assert.ok(g.id.length > 0, 'id must be non-empty')
    assert.ok(g.displayName.length > 0, 'displayName must be non-empty')
    assert.ok(
      g.primitive === 'mcq' || g.primitive === 'term_definition',
      `unexpected primitive on ${g.id}: ${g.primitive}`
    )
  }
})

test('ids are unique', () => {
  const ids = GAME_REGISTRY.map((g) => g.id)
  assert.equal(new Set(ids).size, ids.length, 'duplicate id found in registry')
})

test('wordle is unlevered; every other game honours both levers', () => {
  for (const g of GAME_REGISTRY) {
    if (g.id === 'wordle') {
      assert.equal(g.lever, 'none')
    } else {
      assert.equal(g.lever, 'both', `${g.id} should honour both levers`)
    }
  }
})

test('every wrong/miss payout is zero or negative', () => {
  for (const g of GAME_REGISTRY) {
    if (g.points.kind === 'flat') {
      assert.ok(g.points.wrong <= 0, `${g.id} wrong payout must be <= 0`)
    } else {
      assert.ok(g.points.miss <= 0, `${g.id} miss payout must be <= 0`)
      assert.ok(g.points.byGuessCount.every((v) => v >= 0), `${g.id} guess payouts should not be negative`)
    }
  }
})

test('getGame throws loudly on an unknown id rather than returning undefined', () => {
  assert.throws(() => getGame('crossword'), /Unknown game id/)
})

test('getGame returns the matching entry for a known id', () => {
  const quiz = getGame('quiz-normal')
  assert.equal(quiz.id, 'quiz-normal')
})
