// Package A6: pure logic tests for crossword (lib/games/crossword.ts). Same
// style as tests/connections.test.ts — node --test, no external framework.
// Covers entry grading (including the partial-fill-is-not-attempted rule and
// the accepted double-bill edge case), board grading aggregation, the check
// budget, and board scoring (perfect-bonus gating, check-bonus linearity, the
// no-floor-needed negative-EV property, and the potential view). Routes, the
// API, and UI are a separate task and are not exercised here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gradeEntry,
  gradeBoard,
  checkBudget,
  scoreBoard,
  timeBonusFor,
  gridSucceeded,
  CROSSWORD_LEVER_LOOKBACK,
  type CrosswordBoard,
  type CrosswordEntry,
  type GridState,
} from '../lib/games/crossword.ts'
import { getGame, type GridPoints } from '../lib/games/registry.ts'

const POINTS = getGame('crossword').points as GridPoints

/** A tiny two-entry crossing board: ACROSS "CAT" at (0,0)-(2,0), DOWN "COG"
 *  at (0,0)-(0,2) — they share the 'C' at (0,0). */
const across: CrosswordEntry = { contentItemId: 'across-1', answer: 'CAT', x: 0, y: 0, direction: 'H' }
const down: CrosswordEntry = { contentItemId: 'down-1', answer: 'COG', x: 0, y: 0, direction: 'V' }
const board: CrosswordBoard = { boardId: 'b1', subject: 'Test', entries: [across, down] }

function grid(cells: Record<string, string>): GridState {
  return new Map(Object.entries(cells))
}

test('gradeEntry: fully and correctly filled is correct', () => {
  assert.equal(gradeEntry(across, grid({ '0,0': 'C', '1,0': 'A', '2,0': 'T' })), 'correct')
})

test('gradeEntry: fully filled but wrong letters is wrong', () => {
  assert.equal(gradeEntry(across, grid({ '0,0': 'C', '1,0': 'O', '2,0': 'W' })), 'wrong')
})

test('gradeEntry: an entirely empty entry is not_attempted', () => {
  assert.equal(gradeEntry(across, grid({})), 'not_attempted')
})

test('gradeEntry: comparison is case-insensitive', () => {
  assert.equal(gradeEntry(across, grid({ '0,0': 'c', '1,0': 'a', '2,0': 't' })), 'correct')
})

test('gradeEntry: a down entry only partially filled by crossing across answers is not_attempted, never wrong', () => {
  // Only the shared cell (0,0) is filled, via typing ACROSS's "CAT" -- DOWN's
  // own (0,1) and (0,2) were never touched. This is the exact case the user
  // asked to be excluded from grading: incidental spillover must not cost a
  // mistake the student never actually attempted.
  const g = grid({ '0,0': 'C', '1,0': 'A', '2,0': 'T' })
  assert.equal(gradeEntry(down, g), 'not_attempted')
})

test('gradeEntry: two crossing entries both fully filled with a bad shared letter can BOTH grade wrong -- accepted, not fixed', () => {
  // ACROSS filled wrong at the shared cell; DOWN filled fully (all 3 cells,
  // including its own copy of the same shared cell). One mistake, two wrongs
  // -- documented in crossword.ts's gradeEntry as a deliberate, accepted
  // double-bill, distinct from the partial-fill case above.
  const g = grid({ '0,0': 'X', '1,0': 'A', '2,0': 'T', '0,1': 'O', '0,2': 'G' })
  assert.equal(gradeEntry(across, g), 'wrong')
  assert.equal(gradeEntry(down, g), 'wrong')
})

test('gradeBoard: aggregates correct/wrong/not_attempted counts and per-entry statuses', () => {
  const g = grid({ '0,0': 'C', '1,0': 'A', '2,0': 'T' }) // across correct, down not attempted
  const result = gradeBoard(board, g)
  assert.equal(result.correct, 1)
  assert.equal(result.wrong, 0)
  assert.equal(result.notAttempted, 1)
  assert.equal(result.statuses.get('across-1'), 'correct')
  assert.equal(result.statuses.get('down-1'), 'not_attempted')
})

test('checkBudget: floor division, matching the decided 10-entry -> 3-check example', () => {
  assert.equal(checkBudget(10, POINTS), 3)
  assert.equal(checkBudget(9, POINTS), 3)
  assert.equal(checkBudget(11, POINTS), 3)
  assert.equal(checkBudget(2, POINTS), 0)
})

// A 10-entry board matching the user's worked example (5 correct / 2 wrong / 3
// not attempted), independent of the tiny 2-entry crossing fixture above --
// scoreBoard only needs a BoardGrading and an entry count, not the board itself.
const TEN_ENTRY_EXAMPLE = { correct: 5, wrong: 2, notAttempted: 3, statuses: new Map() }

test("scoreBoard: the user's worked example (5 correct, 2 wrong, 3 not attempted) nets 40 before checks", () => {
  const s = scoreBoard(TEN_ENTRY_EXAMPLE, /* checksUsed */ 3, /* entryCount */ 10, POINTS)
  assert.equal(s.accrual, 5 * POINTS.perEntry + 2 * POINTS.perWrong) // 50 + (-10) = 40
  assert.equal(s.bonus, 0, 'not a clean board -- 2 wrong and 3 not attempted')
  assert.equal(s.checkBonus, 0, 'all 3 checks spent -- nothing unused')
  assert.equal(s.net, 40)
})

test('scoreBoard: a fully correct board (10/10) with all 3 checks retained nets accrual + bonus + full check bonus', () => {
  const grading = { correct: 10, wrong: 0, notAttempted: 0, statuses: new Map() }
  const s = scoreBoard(grading, /* checksUsed */ 0, /* entryCount */ 10, POINTS)
  assert.equal(s.accrual, 10 * POINTS.perEntry) // 100
  assert.equal(s.bonus, POINTS.perfectBonus) // 25
  assert.equal(s.checkBonus, 3 * POINTS.perUnusedCheck) // all 3 retained -> 6
  assert.equal(s.perfect, true)
  assert.equal(s.net, 100 + 25 + 6)
})

test('scoreBoard: perfectBonus requires zero wrong AND zero not-attempted, not just zero wrong', () => {
  // 7 correct, 0 wrong, 3 not attempted -- nothing wrong was submitted, but
  // the board is not fully solved, so no bonus. Explicit user call (7 Aug
  // 2026): the bonus is for a FULLY solved board, not a mistake-free partial one.
  const grading = { correct: 7, wrong: 0, notAttempted: 3, statuses: new Map() }
  const s = scoreBoard(grading, 3, 10, POINTS)
  assert.equal(s.perfect, false)
  assert.equal(s.bonus, 0)
})

test('scoreBoard: check bonus is linear per unused check, not all-or-nothing', () => {
  // Using 1 of 3 checks still pays for the other 2 -- the exact fork the user
  // resolved explicitly: "+2x2 = 4 is the correct one."
  const grading = { correct: 10, wrong: 0, notAttempted: 0, statuses: new Map() }
  const s = scoreBoard(grading, /* checksUsed */ 1, /* entryCount */ 10, POINTS)
  assert.equal(s.checkBonus, 2 * POINTS.perUnusedCheck) // 4
})

test('scoreBoard: a blind wrong guess nets strictly worse than leaving the entry blank -- no floor needed', () => {
  const guessed = scoreBoard({ correct: 0, wrong: 1, notAttempted: 9, statuses: new Map() }, 3, 10, POINTS)
  const blank = scoreBoard({ correct: 0, wrong: 0, notAttempted: 10, statuses: new Map() }, 3, 10, POINTS)
  assert.ok(guessed.net < blank.net, 'guessing wrong must never be better than leaving an entry unattempted')
})

test('scoreBoard: potential view drops the wrong-entry penalty but keeps bonus and checkBonus, mirroring match/Connections', () => {
  const failed = scoreBoard({ correct: 0, wrong: 5, notAttempted: 5, statuses: new Map() }, 3, 10, POINTS)
  assert.equal(failed.potential, 0 + 0 + failed.checkBonus, 'zero correct entries must not cost potential points')

  const clean = scoreBoard({ correct: 10, wrong: 0, notAttempted: 0, statuses: new Map() }, 0, 10, POINTS)
  assert.equal(clean.potential, clean.net, 'with no wrong-entry penalty applied the two views agree')
})

// ---------------------------------------------------------------------------
// scoreBoard's timeBonus parameter (8 Aug 2026, time-lever slice) -- default
// backward compatibility, and that it actually folds into net/potential.
// ---------------------------------------------------------------------------

test('scoreBoard: timeBonus defaults to 0 -- every pre-existing call site is unaffected', () => {
  const grading = { correct: 10, wrong: 0, notAttempted: 0, statuses: new Map() }
  const withDefault = scoreBoard(grading, 0, 10, POINTS)
  const withExplicitZero = scoreBoard(grading, 0, 10, POINTS, 0)
  assert.equal(withDefault.timeBonus, 0)
  assert.deepEqual(withDefault, withExplicitZero)
})

test('scoreBoard: a positive timeBonus adds to both net and potential, SCALED by fraction correct', () => {
  // HIGH 1 fix (8 Aug 2026 adversarial review): grading is 5/10 correct, so
  // fractionCorrect = 0.5 -- a full +20 input timeBonus pays out only +10,
  // not the raw +20 an un-scaled implementation would credit.
  const grading = { correct: 5, wrong: 2, notAttempted: 3, statuses: new Map() }
  const base = scoreBoard(grading, 3, 10, POINTS)
  const withBonus = scoreBoard(grading, 3, 10, POINTS, 20)
  assert.equal(withBonus.timeBonus, 10)
  assert.equal(withBonus.net, base.net + 10)
  assert.equal(withBonus.potential, base.potential + 10)
})

test('scoreBoard: timeBonus is unaffected by scaling on a fully-correct (fraction 1) board', () => {
  const grading = { correct: 10, wrong: 0, notAttempted: 0, statuses: new Map() }
  const withBonus = scoreBoard(grading, 0, 10, POINTS, 20)
  assert.equal(withBonus.timeBonus, 20, 'fraction correct is 1 -- full bonus, unscaled')
})

test('scoreBoard: a negative timeBonus is floored at 0, never subtracted -- same posture as checkBonus', () => {
  const grading = { correct: 5, wrong: 2, notAttempted: 3, statuses: new Map() }
  const base = scoreBoard(grading, 3, 10, POINTS)
  const withNegative = scoreBoard(grading, 3, 10, POINTS, -50)
  assert.equal(withNegative.timeBonus, 0)
  assert.equal(withNegative.net, base.net)
})

// ---------------------------------------------------------------------------
// HIGH 1 (8 Aug 2026 adversarial review): checkBonus and timeBonus must both
// be scaled by fraction correct, so an untouched/barely-attempted board
// cannot farm either bonus. The reported exploit: click Solve immediately,
// submit an empty grid -- 0 correct / 22 not_attempted on the live 22-entry
// board used to net +34 (checkBonus floor(22/3)x2=14, all checks unused,
// plus a full +20 timeBonus for a ~2-second submission), repeatable every
// few seconds.
// ---------------------------------------------------------------------------

test('scoreBoard: checkBonus is scaled by fraction correct, not paid out on a mostly-unattempted board', () => {
  // 5 correct / 5 not attempted out of 10, all 3 checks retained (unused=3).
  // Un-scaled: checkBonus = 3 * perUnusedCheck = 6. Scaled by fraction 0.5: 3.
  const grading = { correct: 5, wrong: 0, notAttempted: 5, statuses: new Map() }
  const s = scoreBoard(grading, 0, 10, POINTS)
  assert.equal(s.checkBonus, Math.round(3 * POINTS.perUnusedCheck * 0.5))
  assert.ok(s.checkBonus < 3 * POINTS.perUnusedCheck, 'must be strictly less than the un-scaled value')
})

test('scoreBoard: an EMPTY board submission (the reported exploit) nets exactly 0, not the full checkBonus + timeBonus', () => {
  // Mirrors the live 22-entry board and its registry points exactly: 0
  // correct, 0 wrong, 22 not attempted, 0 checks spent (budget floor(22/3)=7,
  // all unused), and a fast ~2-second submission inside the full-bonus
  // window (so timeBonusFor alone would return the full maxTimeBonus).
  const entryCount = 22
  const grading = { correct: 0, wrong: 0, notAttempted: entryCount, statuses: new Map() }
  const windowMs = 360_000 // 6 minutes, an arbitrary full-bonus window
  const elapsedMs = 2_000 // ~2 seconds -- well inside the window
  const timeBonus = timeBonusFor(elapsedMs, windowMs, POINTS.maxTimeBonus)
  assert.equal(timeBonus, POINTS.maxTimeBonus, 'sanity check: the raw decay curve alone pays the full bonus here')

  const s = scoreBoard(grading, /* checksUsed */ 0, entryCount, POINTS, timeBonus)
  assert.equal(s.accrual, 0)
  assert.equal(s.bonus, 0, 'not a clean board -- entirely not attempted')
  assert.equal(s.checkBonus, 0, 'fraction correct is 0 -- no check bonus on an untouched board')
  assert.equal(s.timeBonus, 0, 'fraction correct is 0 -- no time bonus on an untouched board')
  assert.equal(s.net, 0, 'an empty-board submission must net exactly 0, not +34')
})

// ---------------------------------------------------------------------------
// timeBonusFor: the decay curve itself. Full bonus inside the window,
// linear decay to zero over a further window's worth of time, floored at 0.
// ---------------------------------------------------------------------------

test('timeBonusFor: full bonus while elapsed is inside the window', () => {
  assert.equal(timeBonusFor(0, 300_000, 20), 20)
  assert.equal(timeBonusFor(150_000, 300_000, 20), 20)
})

test('timeBonusFor: exact boundary -- elapsed === window still pays the FULL bonus', () => {
  assert.equal(timeBonusFor(300_000, 300_000, 20), 20)
})

test('timeBonusFor: decays linearly over a further window worth of time', () => {
  const windowMs = 300_000
  // Halfway through the decay window (window + windowMs/2) -> half the bonus.
  assert.equal(timeBonusFor(windowMs + windowMs / 2, windowMs, 20), 10)
  // A quarter through the decay window -> three quarters of the bonus.
  assert.equal(timeBonusFor(windowMs + windowMs / 4, windowMs, 20), 15)
})

test('timeBonusFor: exact boundary -- elapsed === 2x window pays exactly zero', () => {
  assert.equal(timeBonusFor(600_000, 300_000, 20), 0)
})

test('timeBonusFor: floors at 0 past the decay window, never goes negative', () => {
  assert.equal(timeBonusFor(10_000_000, 300_000, 20), 0)
})

test('timeBonusFor: a null/absent elapsed (modelled as +Infinity, see the submit route) always floors to 0', () => {
  assert.equal(timeBonusFor(Number.POSITIVE_INFINITY, 300_000, 20), 0)
})

test('timeBonusFor: zero or negative maxBonus/windowMs never produces a bonus (guards, not a crash)', () => {
  assert.equal(timeBonusFor(0, 300_000, 0), 0)
  assert.equal(timeBonusFor(0, 0, 20), 0)
})

// ---------------------------------------------------------------------------
// gridSucceeded: the board-grained "did this count as a win for the lever"
// threshold, mirroring match.ts's boardSucceeded.
// ---------------------------------------------------------------------------

test('gridSucceeded: strictly more than half correct is a success', () => {
  assert.equal(gridSucceeded(6, 10), true)
  assert.equal(gridSucceeded(5, 10), false, 'exactly half is not a success')
  assert.equal(gridSucceeded(0, 10), false)
})

test('gridSucceeded: an empty board (total 0) is never a success', () => {
  assert.equal(gridSucceeded(0, 0), false)
})

test('CROSSWORD_LEVER_LOOKBACK is a positive, bounded number', () => {
  assert.ok(CROSSWORD_LEVER_LOOKBACK > 0)
  assert.ok(Number.isInteger(CROSSWORD_LEVER_LOOKBACK))
})
