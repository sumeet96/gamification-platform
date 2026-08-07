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

test('wordle and connections are unlevered; every other game honours both levers', () => {
  // wordle: one board/day, the lever would fire 24h apart, not adaptivity.
  // connections: deliberate for this build (docs/NEXT_SESSION_BUILD_BRIEF.md
  // §6, confirmed by the user 6 Aug 2026) — no clock, no difficulty tiebreak.
  const unlevered = new Set(['wordle', 'connections'])
  for (const g of GAME_REGISTRY) {
    if (unlevered.has(g.id)) {
      assert.equal(g.lever, 'none')
    } else {
      assert.equal(g.lever, 'both', `${g.id} should honour both levers`)
    }
  }
})

test('every wrong/miss/floor payout is zero or negative', () => {
  // Exhaustive switch, not if/else: the `never` default means a fourth Points kind is a
  // compile error here rather than silently falling into another kind's assertions. The
  // previous two-branch form sent match's BoardPoints into the Wordle branch.
  for (const g of GAME_REGISTRY) {
    switch (g.points.kind) {
      case 'flat':
        assert.ok(g.points.wrong <= 0, `${g.id} wrong payout must be <= 0`)
        break
      case 'guessCount':
        assert.ok(g.points.miss <= 0, `${g.id} miss payout must be <= 0`)
        assert.ok(g.points.byGuessCount.every((v) => v >= 0), `${g.id} guess payouts should not be negative`)
        break
      case 'board':
        assert.ok(g.points.floorPenalty <= 0, `${g.id} floor penalty must be <= 0`)
        assert.ok(g.points.perPair > 0, `${g.id} must reward a correct pair`)
        assert.ok(g.points.perfectBonus >= 0, `${g.id} clean-board bonus must not be a punishment`)
        // Without this a random board pays out: a random permutation has exactly one
        // expected fixed point at any size, so accrual alone rewards pure guessing.
        assert.ok(
          g.points.perPair + g.points.floorPenalty < 0,
          `${g.id} floor must make a randomly-filled board negative-EV`
        )
        break
      case 'partition':
        assert.ok(g.points.perGroup > 0, `${g.id} must reward a correctly solved group`)
        assert.ok(g.points.perfectBonus >= 0, `${g.id} clean-board bonus must not be a punishment`)
        assert.ok(g.points.mistakePenalty <= 0, `${g.id} mistake penalty must be <= 0`)
        assert.ok(g.points.floorPenalty <= 0, `${g.id} floor penalty must be <= 0`)
        assert.ok(g.points.maxMistakes > 0, `${g.id} must allow at least one mistake`)
        // Solving all 4 groups with zero mistakes must be the maximum achievable
        // score — true structurally as long as perGroup > 0, mistakePenalty <= 0
        // and perfectBonus >= 0 above hold, since every mistake only ever
        // subtracts and every unsolved group only ever forgoes accrual.
        // Unlike match's random-permutation exploit (a blind guess has exactly 1
        // expected fixed point), a blind 4-tile guess here is 1 of C(16,4) = 1820
        // combinations — guessing essentially never lands a group, so the floor
        // is not defeating an accrual exploit. It exists to make giving up
        // (exhausting the mistake budget while stuck at or below floorAtOrBelow
        // groups) net negative instead of merely break-even.
        assert.ok(
          g.points.floorAtOrBelow * g.points.perGroup +
            g.points.maxMistakes * g.points.mistakePenalty +
            g.points.floorPenalty <
            0,
          `${g.id} exhausting the mistake budget at or below the floor must net negative`
        )
        break
      case 'grid':
        assert.ok(g.points.perEntry > 0, `${g.id} must reward a correct entry`)
        assert.ok(g.points.perWrong <= 0, `${g.id} wrong-entry penalty must be <= 0`)
        assert.ok(g.points.perfectBonus >= 0, `${g.id} clean-grid bonus must not be a punishment`)
        assert.ok(g.points.checkBudgetDivisor > 0, `${g.id} check budget divisor must be positive`)
        assert.ok(g.points.perUnusedCheck >= 0, `${g.id} unused-check reward must not be a punishment`)
        // Unlike match/Connections, no separate floor is needed: perWrong < 0 and
        // an unattempted entry contributes exactly 0, so blind guessing is already
        // strictly worse than leaving a blank -- the same negative-EV-for-guessing
        // property those games' floors exist to create, here for free from the
        // per-entry rate alone. See GridPoints' docstring.
        assert.ok(
          g.points.perWrong < 0,
          `${g.id} a wrong guess must net worse than leaving an entry blank (which nets 0)`
        )
        break
      default: {
        const exhaustive: never = g.points
        throw new Error(`unhandled points kind: ${JSON.stringify(exhaustive)}`)
      }
    }
  }
})

test('getGame throws loudly on an unknown id rather than returning undefined', () => {
  assert.throws(() => getGame('nonexistent-game'), /Unknown game id/)
})

test('getGame returns the matching entry for a known id', () => {
  const quiz = getGame('quiz-normal')
  assert.equal(quiz.id, 'quiz-normal')
})
