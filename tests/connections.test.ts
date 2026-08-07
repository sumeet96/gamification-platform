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
  isMistakeBudgetExhausted,
  deriveTerminalReason,
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
  const perfect = scoreBoard(4, 0, POINTS, 'solved')
  assert.equal(perfect.perfect, true)
  assert.equal(perfect.net, 4 * POINTS.perGroup + POINTS.perfectBonus)

  // Nothing else beats it: fewer groups solved forgoes accrual, any mistake
  // both loses the bonus and subtracts mistakePenalty. terminalReason is
  // 'budget' throughout -- the most favourable-to-the-floor case -- so this
  // remains true even where the floor could apply.
  for (let g = 0; g <= 4; g++) {
    for (let m = 0; m <= POINTS.maxMistakes; m++) {
      if (g === 4 && m === 0) continue
      assert.ok(
        scoreBoard(g, m, POINTS, 'budget').net < perfect.net,
        `(${g} groups, ${m} mistakes) must score less than a perfect board`
      )
    }
  }
})

test('a board lost on the mistake budget, solving nothing, nets the floor plus mistake cost', () => {
  const lost = scoreBoard(0, POINTS.maxMistakes, POINTS, 'budget')
  assert.equal(lost.perfect, false)
  assert.equal(lost.bonus, 0)
  assert.equal(lost.accrual, 0)
  assert.equal(lost.mistakeCost, POINTS.maxMistakes * POINTS.mistakePenalty)
  assert.equal(lost.floor, POINTS.floorPenalty, '0 solved is always at or below the floor threshold')
  assert.ok(lost.net < 0, 'exhausting the budget with nothing solved must net negative')
})

test('the floor case: exhausting the budget at exactly floorAtOrBelow groups solved nets negative', () => {
  const s = scoreBoard(POINTS.floorAtOrBelow, POINTS.maxMistakes, POINTS, 'budget')
  assert.equal(s.floor, POINTS.floorPenalty)
  assert.ok(s.net < 0, 'giving up at or below the floor threshold must not be break-even or positive')
})

// ---------------------------------------------------------------------------
// FIX 4 (A5 adversarial review): the floor must fire ONLY when the board
// actually ended on the mistake budget, never on a genuinely abandoned board
// (exitMidRound calling completeBoard('abandoned') on a freshly served
// board used to floor it invisibly -- groupsSolved 0 <= floorAtOrBelow, and
// scoreBoard used to ignore terminal_reason entirely).
// ---------------------------------------------------------------------------

test('FIX 4: floor only applies when terminalReason is "budget"', () => {
  const budget = scoreBoard(0, POINTS.maxMistakes, POINTS, 'budget')
  assert.equal(budget.floor, POINTS.floorPenalty)

  const abandoned = scoreBoard(0, 0, POINTS, 'abandoned')
  assert.equal(abandoned.floor, 0, 'a board abandoned immediately after being served must not be floored')

  const solved = scoreBoard(4, 0, POINTS, 'solved')
  assert.equal(solved.floor, 0)
})

test('FIX 4: an abandoned board is never floored, even with the exact groups/mistakes that would floor a budget-exhausted one', () => {
  // Same numbers as "the floor case" above -- only terminalReason differs.
  const s = scoreBoard(POINTS.floorAtOrBelow, POINTS.maxMistakes, POINTS, 'abandoned')
  assert.equal(s.floor, 0)
  assert.equal(s.net, s.accrual + s.mistakeCost + s.bonus, 'no floor component should be present in net at all')
})

test('N wrong guesses cost N x mistakePenalty, never N x 4', () => {
  for (let n = 1; n <= POINTS.maxMistakes; n++) {
    const s = scoreBoard(2, n, POINTS, 'budget')
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
  const failed = scoreBoard(0, POINTS.maxMistakes, POINTS, 'budget')
  assert.equal(failed.potential, 0, 'a failed board must not cost potential points')

  const clean = scoreBoard(4, 0, POINTS, 'solved')
  assert.equal(clean.potential, clean.net, 'with no penalty applied the two views agree')
})

// ---------------------------------------------------------------------------
// FIX 2 (A5 adversarial review): the mistake budget must be enforced
// server-side, not merely assumed from client behaviour.
// ---------------------------------------------------------------------------

test('FIX 2: isMistakeBudgetExhausted is false below the budget, true at and beyond it', () => {
  for (let m = 0; m < POINTS.maxMistakes; m++) {
    assert.equal(isMistakeBudgetExhausted(m, POINTS), false, `${m} mistakes must not yet exhaust a ${POINTS.maxMistakes}-mistake budget`)
  }
  assert.equal(isMistakeBudgetExhausted(POINTS.maxMistakes, POINTS), true)
  assert.equal(isMistakeBudgetExhausted(POINTS.maxMistakes + 1, POINTS), true, 'must stay exhausted, not flip back once past the budget')
})

// ---------------------------------------------------------------------------
// FIX 3 (A5 adversarial review): every component of a board's score has
// exactly one home -- group_solved carries perGroup accrual, board_complete
// carries mistakeCost + perfectBonus + floor, guess_submitted carries
// nothing. Summing points_delta over (group_solved, board_complete) for one
// board serve must equal scoreBoard().net exactly, with no double-write and
// no missing component (previously: accrual was double-written to BOTH
// guess_submitted and group_solved, board_complete never carried mistakeCost
// at all, and app/api/stats/route.ts summed neither guess_submitted nor
// group_solved -- so a perfect board showed the student +100 but recorded 0
// accrual anywhere the lifetime score could see it).
// ---------------------------------------------------------------------------

test('FIX 3: group_solved + board_complete points sum to scoreBoard().net exactly, across a range of outcomes', () => {
  const cases: Array<[number, number, 'solved' | 'budget' | 'abandoned']> = [
    [4, 0, 'solved'],
    [3, 2, 'budget'],
    [0, POINTS.maxMistakes, 'budget'],
    [POINTS.floorAtOrBelow, POINTS.maxMistakes, 'budget'],
    [2, 1, 'abandoned'],
    [0, 0, 'abandoned'],
  ]
  for (const [groupsSolved, mistakes, terminalReason] of cases) {
    const scored = scoreBoard(groupsSolved, mistakes, POINTS, terminalReason)
    // group_solved: one row per solved group, each carrying perGroup -- so
    // the rows for this serve sum to exactly groupsSolved x perGroup.
    const groupSolvedTotal = groupsSolved * POINTS.perGroup
    assert.equal(groupSolvedTotal, scored.accrual, `(${groupsSolved}, ${mistakes}, ${terminalReason}): group_solved rows must sum to scoreBoard().accrual`)
    // board_complete: exactly one row, carrying mistakeCost + bonus + floor.
    const boardCompleteTotal = scored.mistakeCost + scored.bonus + scored.floor
    assert.equal(
      groupSolvedTotal + boardCompleteTotal,
      scored.net,
      `(${groupsSolved}, ${mistakes}, ${terminalReason}): group_solved + board_complete must sum to scoreBoard().net exactly`
    )
  }
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

// --- deriveTerminalReason -------------------------------------------------
// The terminal reason gates floorPenalty, which makes it a scoring input. It
// is therefore derived from server-known state and never read from the
// request body: a client that had spent the whole mistake budget could
// otherwise claim 'abandoned' and dodge the floor. These tests pin that
// derivation, because the failure is silent — a wrong reason still writes a
// valid row and still passes db/011's CHECK.

test('deriveTerminalReason: all four groups is solved, even on the last permitted mistake', () => {
  assert.equal(deriveTerminalReason(4, POINTS.maxMistakes, POINTS), 'solved')
  assert.equal(deriveTerminalReason(4, 0, POINTS), 'solved')
})

test('deriveTerminalReason: a spent mistake budget is budget, not abandoned', () => {
  assert.equal(deriveTerminalReason(0, POINTS.maxMistakes, POINTS), 'budget')
  assert.equal(deriveTerminalReason(2, POINTS.maxMistakes, POINTS), 'budget')
})

test('deriveTerminalReason: an unfinished board with budget left is abandoned', () => {
  assert.equal(deriveTerminalReason(0, 0, POINTS), 'abandoned')
  assert.equal(deriveTerminalReason(2, POINTS.maxMistakes - 1, POINTS), 'abandoned')
})

test('claiming abandoned after busting the budget cannot dodge the floor penalty', () => {
  // The exploit this derivation closes: the client asserts 'abandoned', but
  // the server derives from its own counts and still applies the floor.
  const derived = deriveTerminalReason(0, POINTS.maxMistakes, POINTS)
  const honest = scoreBoard(0, POINTS.maxMistakes, POINTS, derived)
  const dodged = scoreBoard(0, POINTS.maxMistakes, POINTS, 'abandoned')

  assert.equal(derived, 'budget')
  assert.equal(honest.floor, POINTS.floorPenalty)
  assert.ok(
    honest.net < dodged.net,
    'the floor must actually cost something, or this test proves nothing'
  )
})
