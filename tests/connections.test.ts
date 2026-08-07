// Package A5: pure logic tests for Connections (lib/games/connections.ts).
// Same style as tests/match.test.ts — node --test, no external framework.
// These tests cover the pure-logic layer only: guess hashing, guess
// evaluation (including the malformed-guess-must-not-cost-a-mistake rule),
// board scoring (including the per-guess-not-per-tile mistake billing), the
// forced-fourth-group flag, and seeded-shuffle reproducibility. Routes and UI
// are a separate task and are not exercised here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  evaluateGuess,
  guessHash,
  scoreBoard,
  shuffleBoardTiles,
  type ConnectionsBoard,
} from '../lib/games/connections.ts'
import { getGame, type PartitionBoardPoints } from '../lib/games/registry.ts'

const POINTS = getGame('connections').points as PartitionBoardPoints

/** A 4x4 board: group g0..g3, each with tiles g{n}-0 .. g{n}-3. */
const board: ConnectionsBoard = {
  boardId: 'board-1',
  subject: 'Digital Transformation',
  groups: Array.from({ length: 4 }, (_, g) => ({
    groupId: `g${g}`,
    label: `Group ${g}`,
    tiles: Array.from({ length: 4 }, (_, t) => ({
      contentItemId: `g${g}-${t}`,
      text: `Tile ${g}-${t}`,
    })),
  })),
}

const groupIds = (n: number) => board.groups[n].tiles.map((t) => t.contentItemId)

// ---------------------------------------------------------------------------
// guessHash
// ---------------------------------------------------------------------------

test('guessHash is order-independent', () => {
  const ids = groupIds(0)
  const shuffled = [ids[2], ids[0], ids[3], ids[1]]
  assert.equal(guessHash(ids), guessHash(shuffled))
})

test('guessHash changes when one id changes', () => {
  const ids = groupIds(0)
  const withOneSwapped = [...ids.slice(0, 3), 'g1-0']
  assert.notEqual(guessHash(ids), guessHash(withOneSwapped))
})

// ---------------------------------------------------------------------------
// evaluateGuess
// ---------------------------------------------------------------------------

test('evaluateGuess: an exact hit is correct and names its group', () => {
  const r = evaluateGuess(board, groupIds(2))
  assert.ok(r.ok)
  assert.equal(r.ok && r.correct, true)
  assert.equal(r.ok && r.groupId, 'g2')
  assert.equal(r.ok && r.groupOrdinal, 2)
  assert.equal(r.ok && r.oneAway, false)
})

test('evaluateGuess: exactly 3 of 4 shared is one-away, not correct', () => {
  const guess = [...groupIds(0).slice(0, 3), groupIds(1)[0]]
  const r = evaluateGuess(board, guess)
  assert.ok(r.ok)
  assert.equal(r.ok && r.correct, false)
  assert.equal(r.ok && r.oneAway, true)
  assert.equal(r.ok && r.groupId, null)
})

test('evaluateGuess: a plain miss (2 and 2, or scattered) is neither correct nor one-away', () => {
  const guess = [groupIds(0)[0], groupIds(0)[1], groupIds(1)[0], groupIds(1)[1]]
  const r = evaluateGuess(board, guess)
  assert.ok(r.ok)
  assert.equal(r.ok && r.correct, false)
  assert.equal(r.ok && r.oneAway, false)
})

test('evaluateGuess: malformed — wrong count is rejected, not scored as a miss', () => {
  const r = evaluateGuess(board, groupIds(0).slice(0, 3))
  assert.equal(r.ok, false)
  assert.equal(!r.ok && r.reason, 'wrong_count')
})

test('evaluateGuess: malformed — duplicate ids are rejected, not scored as a miss', () => {
  const ids = groupIds(0)
  const withDup = [ids[0], ids[0], ids[1], ids[2]]
  const r = evaluateGuess(board, withDup)
  assert.equal(r.ok, false)
  assert.equal(!r.ok && r.reason, 'duplicate_ids')
})

test('evaluateGuess: malformed — an id not on this board is rejected, not scored as a miss', () => {
  const guess = [...groupIds(0).slice(0, 3), 'not-on-this-board']
  const r = evaluateGuess(board, guess)
  assert.equal(r.ok, false)
  assert.equal(!r.ok && r.reason, 'unknown_tile')
})

// ---------------------------------------------------------------------------
// forced fourth group
// ---------------------------------------------------------------------------

test('forced is true only on the fourth group, given the other three were already solved', () => {
  for (let solvedBefore = 0; solvedBefore <= 2; solvedBefore++) {
    const r = evaluateGuess(board, groupIds(solvedBefore), solvedBefore)
    assert.equal(r.ok, true)
    assert.equal(r.ok && r.forced, false, `group ${solvedBefore} of 3 must not be forced`)
  }
  const r = evaluateGuess(board, groupIds(3), 3)
  assert.equal(r.ok, true)
  assert.equal(r.ok && r.forced, true, 'the fourth group, after the other three, is forced')
})

test('forced is false on an incorrect guess even if groupsSolvedBefore is 3', () => {
  const wrongGuess = [groupIds(3)[0], groupIds(3)[1], groupIds(3)[2], groupIds(0)[0]]
  const r = evaluateGuess(board, wrongGuess, 3)
  assert.ok(r.ok)
  assert.equal(r.ok && r.correct, false)
  assert.equal(r.ok && r.forced, false)
})

// ---------------------------------------------------------------------------
// scoreBoard
// ---------------------------------------------------------------------------

test('the registry entry for connections is partition-scored', () => {
  assert.equal(POINTS.kind, 'partition')
  assert.ok(POINTS.perGroup > 0)
  assert.ok(POINTS.mistakePenalty <= 0)
  assert.ok(POINTS.floorPenalty <= 0)
  assert.ok(POINTS.perfectBonus >= 0)
})

test('a perfect board (4 groups, 0 mistakes) is the maximum achievable score', () => {
  const perfect = scoreBoard(4, 0, POINTS)
  assert.equal(perfect.perfect, true)
  assert.equal(perfect.net, 4 * POINTS.perGroup + POINTS.perfectBonus)

  // Nothing else beats it: fewer groups solved forgoes accrual, any mistake
  // both loses the bonus and subtracts mistakePenalty.
  for (let g = 0; g <= 4; g++) {
    for (let m = 0; m <= POINTS.maxMistakes; m++) {
      if (g === 4 && m === 0) continue
      assert.ok(
        scoreBoard(g, m, POINTS).net < perfect.net,
        `(${g} groups, ${m} mistakes) must score less than a perfect board`
      )
    }
  }
})

test('a board lost on the mistake budget, solving nothing, nets the floor plus mistake cost', () => {
  const lost = scoreBoard(0, POINTS.maxMistakes, POINTS)
  assert.equal(lost.perfect, false)
  assert.equal(lost.bonus, 0)
  assert.equal(lost.accrual, 0)
  assert.equal(lost.mistakeCost, POINTS.maxMistakes * POINTS.mistakePenalty)
  assert.equal(lost.floor, POINTS.floorPenalty, '0 solved is always at or below the floor threshold')
  assert.ok(lost.net < 0, 'exhausting the budget with nothing solved must net negative')
})

test('the floor case: exhausting the budget at exactly floorAtOrBelow groups solved nets negative', () => {
  const s = scoreBoard(POINTS.floorAtOrBelow, POINTS.maxMistakes, POINTS)
  assert.equal(s.floor, POINTS.floorPenalty)
  assert.ok(s.net < 0, 'giving up at or below the floor threshold must not be break-even or positive')
})

test('N wrong guesses cost N x mistakePenalty, never N x 4', () => {
  for (let n = 1; n <= POINTS.maxMistakes; n++) {
    const s = scoreBoard(2, n, POINTS)
    assert.equal(s.mistakeCost, n * POINTS.mistakePenalty)
    // n=0 is skipped -- both formulas agree trivially at zero mistakes, so it
    // proves nothing about per-guess vs per-tile billing.
    assert.notEqual(
      s.mistakeCost,
      n * 4 * POINTS.mistakePenalty,
      'a four-tile guess must be billed as one decision, not four'
    )
  }
})

test('potential ignores the floor penalty but keeps the bonus, mirroring match', () => {
  const failed = scoreBoard(0, POINTS.maxMistakes, POINTS)
  assert.equal(failed.potential, 0, 'a failed board must not cost potential points')

  const clean = scoreBoard(4, 0, POINTS)
  assert.equal(clean.potential, clean.net, 'with no penalty applied the two views agree')
})

// ---------------------------------------------------------------------------
// seeded shuffle
// ---------------------------------------------------------------------------

test('shuffleBoardTiles: the same seed reproduces the same order', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  assert.deepEqual(shuffleBoardTiles(items, 12345), shuffleBoardTiles(items, 12345))
})

test('shuffleBoardTiles: a different seed gives a different order (fixed seeds, not probabilistic)', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  assert.notDeepEqual(shuffleBoardTiles(items, 1), shuffleBoardTiles(items, 2))
})

test('shuffleBoardTiles: never touches Math.random — same seed on two separate calls agrees regardless of intervening Math.random use', () => {
  const items = ['a', 'b', 'c', 'd']
  const before = shuffleBoardTiles(items, 999)
  for (let i = 0; i < 100; i++) Math.random()
  const after = shuffleBoardTiles(items, 999)
  assert.deepEqual(before, after)
})

// ---------------------------------------------------------------------------
// Guard: this package must never touch the lever machinery (confirmed by the
// user 6 Aug 2026 — lever: 'none', no clock, no config.lever branching).
// ---------------------------------------------------------------------------

/** Strips line and block comments so the guard below checks actual code, not
 *  prose explaining why the banned identifiers are absent — both source
 *  files' header comments legitimately mention resolveLever() and
 *  BOARD_TIME_BASE by name (to say they must not be used), which would
 *  otherwise false-positive a naive substring scan. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

test('connections source never references resolveLever, BOARD_TIME_BASE, or config.lever', () => {
  const files = ['../lib/games/connections.ts', '../lib/games/registry.ts']
  for (const rel of files) {
    const src = stripComments(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'))
    assert.ok(!src.includes('resolveLever'), `${rel} must not call resolveLever()`)
    assert.ok(!src.includes('BOARD_TIME_BASE'), `${rel} must not read BOARD_TIME_BASE`)
    assert.ok(!/config\.lever/.test(src), `${rel} must not branch on config.lever`)
  }
})
