// FIX A (adversarial review of package A1): app/api/stats/route.ts computed `potential`
// as `answered * POINTS_CORRECT` for every game, which is only correct for the quiz's flat
// 20-point scoring. Match (BoardPoints) pays 15/pair plus a board-grained bonus/floor, so
// that formula overstated match's potential. The fix added `potentialForGame` to derive
// potential per game_type off the registry instead.
//
// The previous version of this test was a hand-copied MIRROR of potentialForGame's body,
// so it could not fail if the shipped function drifted. Fixed: potentialForGame moved out
// of app/api/stats/route.ts into lib/games/potential.ts -- a pure module with no DB and no
// next/headers dependency (app/api/stats/route.ts's only next/headers-dependent piece is
// getCurrentStudent, which this function never touched) -- and this test imports the real
// exported function directly.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { potentialForGame } from '../lib/games/potential.ts'
import { POINTS_CORRECT } from '../lib/game/engine.ts'

test('quiz (flat points): potential is answered * the flat correct value', () => {
  assert.equal(potentialForGame('quiz-normal', 10, 0), 10 * 20)
  assert.equal(potentialForGame('quiz-rapid', 3, 0), 3 * 20)
})

test('match (board points): potential is answered pairs at perPair plus one perfectBonus per board', () => {
  // 6 pairs answered across one board, one board completed: 6*15 + 1*30 = 120 -- exactly
  // the "clean 6-pair board pays 120" figure from the bug report.
  assert.equal(potentialForGame('match', 6, 1), 6 * 15 + 1 * 30)
})

test('match potential with zero boards completed does not add a phantom bonus', () => {
  assert.equal(potentialForGame('match', 4, 0), 4 * 15)
})

test('wordle (guessCount points): potential is answered * the best-guess-count payout (placeholder, untested against real play)', () => {
  // Wordle is `enabled: false` in the registry -- no guessCount row exists in production
  // data yet, so this is the only place the branch is exercised at all. byGuessCount for
  // 'wordle' is [40, 40, 30, 22, 15, 10]; Math.max of that is 40, the best-case payout the
  // code assumes for every attempt. See the PLACEHOLDER comment in
  // lib/games/potential.ts -- this test pins that placeholder, not real play.
  assert.equal(potentialForGame('wordle', 5, 0), 5 * 40)
})

test("unknown (legacy pre-game_type) bucket keeps the old flat POINTS_CORRECT behaviour", () => {
  assert.equal(potentialForGame('unknown', 5, 0), 5 * POINTS_CORRECT)
})

test('a game_type not in the registry contributes 0 rather than throwing', () => {
  assert.equal(potentialForGame('nonexistent-game', 5, 0), 0)
})
