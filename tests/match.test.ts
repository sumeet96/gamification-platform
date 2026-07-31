// Package A1: match-the-following board scoring. These tests pin the points table
// agreed for the board (15/pair, +30 clean board, -20 at 2 or fewer) and the
// permutation facts it was derived from. If the professor changes the numbers, the
// table test below is the one place to change them.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BOARD_SIZE,
  boardSucceeded,
  matchesTerm,
  normaliseTerm,
  scoreBoard,
  type BoardPair,
} from '../lib/games/match.ts'
import { getGame, type BoardPoints } from '../lib/games/registry.ts'

const POINTS = getGame('match').points as BoardPoints

/** A 6-pair board: term N is "Term N", clue N is "Clue N". */
const board: BoardPair[] = Array.from({ length: BOARD_SIZE }, (_, i) => ({
  itemId: `item-${i}`,
  clue: `Clue ${i}`,
  term: `Term ${i}`,
  variants: [],
}))

/** Submit `correct` pairs correctly; give every remaining clue some OTHER board term,
 *  so the submission stays a legal bijection rather than a shape a student could not
 *  actually produce by dragging tiles. */
function submitWith(correct: number): Record<string, string> {
  const out: Record<string, string> = {}
  board.forEach((p, i) => {
    out[p.itemId] = i < correct ? p.term : board[((i + 1) % (BOARD_SIZE - correct)) + correct].term
  })
  return out
}

test('the registry entry for match is board-scored', () => {
  assert.equal(POINTS.kind, 'board')
  assert.ok(POINTS.perPair > 0, 'perPair must reward a correct pair')
  assert.ok(POINTS.floorPenalty <= 0, 'floorPenalty must never reward a failed board')
  assert.ok(POINTS.perfectBonus >= 0, 'perfectBonus must never punish a clean board')
})

test('the agreed points table, exactly', () => {
  // Correct-pair counts achievable on a 6-pair bijection: 6, 4, 3, 2, 1, 0.
  // 5 is impossible — a permutation cannot have exactly n-1 fixed points — so it is
  // deliberately absent rather than forgotten.
  const expected: Array<[number, number]> = [
    [6, 120], // 90 accrual + 30 clean-board bonus
    [4, 60], // one confusion: two pairs lost, and the bonus
    [3, 45],
    [2, 10], // 30 accrual - 20 floor
    [1, -5],
    [0, -20],
  ]
  for (const [correct, net] of expected) {
    const s = scoreBoard(board, submitWith(correct), POINTS)
    assert.equal(s.correctCount, correct, `expected ${correct} correct pairs`)
    assert.equal(s.net, net, `net for ${correct}/6`)
  }
})

test('a clean board is the only one that pays the bonus', () => {
  assert.equal(scoreBoard(board, submitWith(6), POINTS).bonus, POINTS.perfectBonus)
  assert.equal(scoreBoard(board, submitWith(4), POINTS).bonus, 0)
})

test('potential ignores the floor penalty but keeps the bonus', () => {
  const failed = scoreBoard(board, submitWith(0), POINTS)
  assert.equal(failed.net, POINTS.floorPenalty)
  assert.equal(failed.potential, 0, 'a failed board must not cost potential points')

  const clean = scoreBoard(board, submitWith(6), POINTS)
  assert.equal(clean.potential, clean.net, 'with no penalty applied the two views agree')
})

test('guessing is negative-EV: the floor must outweigh one expected fixed point', () => {
  // A random permutation has exactly 1 expected fixed point at any board size, so
  // accrual alone would pay perPair for pure guessing. This is the whole reason the
  // floor exists; if someone removes it, this fails.
  assert.ok(
    POINTS.perPair + POINTS.floorPenalty < 0,
    'expected payout for a random board must be negative'
  )
})

test('an unfilled or missing slot is wrong, not an error', () => {
  const partial = { [board[0].itemId]: board[0].term, [board[1].itemId]: null }
  const s = scoreBoard(board, partial, POINTS)
  assert.equal(s.correctCount, 1)
  assert.equal(s.pairs[1].correct, false)
  assert.equal(s.pairs[1].submitted, null)
  assert.equal(s.pairs[5].submitted, null, 'a key absent entirely is treated as unfilled')
})

test('matching is case-, punctuation- and quote-insensitive', () => {
  const pair: BoardPair = {
    itemId: 'x',
    clue: 'c',
    term: "Minimum Viable Product",
    variants: ['MVP'],
  }
  assert.ok(matchesTerm('minimum viable product', pair))
  assert.ok(matchesTerm('  Minimum-Viable  Product ', pair))
  assert.ok(matchesTerm('mvp', pair), 'declared variants count')
  assert.ok(!matchesTerm('minimum viable', pair), 'a prefix is not a match')
  assert.ok(!matchesTerm('', pair))
  assert.ok(!matchesTerm(null, pair))
})

test('normaliseTerm collapses whitespace and strips punctuation', () => {
  assert.equal(normaliseTerm('  Lean &  Agile: Delivery!  '), 'lean agile delivery')
  assert.equal(normaliseTerm('it’s'), "it s")
})

test('boardSucceeded needs strictly more than half', () => {
  assert.equal(boardSucceeded(4, 6), true)
  assert.equal(boardSucceeded(3, 6), false, 'exactly half is not a success')
  assert.equal(boardSucceeded(0, 6), false)
  assert.equal(boardSucceeded(0, 0), false, 'an empty board is not a success')
})

test('the lever never ramps up on a board that also charges the floor penalty', () => {
  for (let c = 0; c <= BOARD_SIZE; c++) {
    const s = scoreBoard(board, submitWith(Math.min(c, BOARD_SIZE)), POINTS)
    if (boardSucceeded(s.correctCount, s.total)) {
      assert.equal(s.floor, 0, `a successful board (${s.correctCount}/6) must not be penalised`)
    }
  }
})
