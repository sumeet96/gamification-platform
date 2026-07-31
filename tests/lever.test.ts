// Package K-4: the adaptivity lever resolver must make it structurally
// impossible for a game to honour both levers at once. These tests drive a
// realistic mixed sequence of answers through resolveLever/advanceLeverState
// and check that, per lever, exactly one of {difficulty, timeLimit} moves.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialLeverState,
  resolveLever,
  advanceLeverState,
  roundLength,
  DIFFICULTY_MAX,
  START_DIFFICULTY,
  TIME_BASE,
  BOARD_TIME_BASE,
  BOARD_TIME_MIN,
  BOARD_TIME_STEP,
  type GameConfig,
} from '../lib/game/engine.ts'

// 24 answers, mixed correct/wrong — long enough to exercise streak resets,
// difficulty floor/ceiling, and the time-mode floor at TIME_MIN.
const ANSWERS = [
  true, true, false, true, true, true, false, false,
  true, false, true, true, true, true, false, true,
  false, true, true, false, true, true, true, true,
]

test('adaptive lever: timeLimit never varies', () => {
  const config: GameConfig = { mode: 'normal', lever: 'adaptive', fixedDifficulty: 3 }
  let state = initialLeverState(config)
  const { timeLimit: first } = resolveLever(config, state)
  for (const correct of ANSWERS) {
    const { timeLimit } = resolveLever(config, state)
    assert.equal(timeLimit, first)
    state = advanceLeverState(config, state, correct)
  }
})

test('time lever: difficulty never varies', () => {
  const config: GameConfig = { mode: 'normal', lever: 'time', fixedDifficulty: 3 }
  let state = initialLeverState(config)
  const { difficulty: first } = resolveLever(config, state)
  assert.equal(first, config.fixedDifficulty)
  for (const correct of ANSWERS) {
    const { difficulty } = resolveLever(config, state)
    assert.equal(difficulty, config.fixedDifficulty)
    state = advanceLeverState(config, state, correct)
  }
})

test('adaptive lever: difficulty actually changes at least once', () => {
  const config: GameConfig = { mode: 'normal', lever: 'adaptive', fixedDifficulty: 3 }
  let state = initialLeverState(config)
  const seen = new Set<number>()
  for (const correct of ANSWERS) {
    seen.add(resolveLever(config, state).difficulty)
    state = advanceLeverState(config, state, correct)
  }
  assert.ok(seen.size > 1, `expected difficulty to vary, saw only ${[...seen]}`)
})

test('time lever: timeLimit actually changes at least once', () => {
  const config: GameConfig = { mode: 'normal', lever: 'time', fixedDifficulty: 3 }
  let state = initialLeverState(config)
  const seen = new Set<number>()
  for (const correct of ANSWERS) {
    seen.add(resolveLever(config, state).timeLimit)
    state = advanceLeverState(config, state, correct)
  }
  assert.ok(seen.size > 1, `expected timeLimit to vary, saw only ${[...seen]}`)
})

// Change 3: the adaptive ramp now moves only after two CONSECUTIVE
// same-direction answers, so a lone correct right after a wrong (or vice
// versa) must not move the level.
test('adaptive lever: one correct after a wrong does not move the level (two-consecutive rule)', () => {
  const config: GameConfig = { mode: 'normal', lever: 'adaptive', fixedDifficulty: 3 }
  let state = initialLeverState(config)
  // Two consecutive correct answers -> one bump, from START_DIFFICULTY.
  state = advanceLeverState(config, state, true)
  state = advanceLeverState(config, state, true)
  const bumped = resolveLever(config, state).difficulty
  assert.equal(bumped, START_DIFFICULTY + 1)
  // A single wrong answer breaks the streak but is not itself two-in-a-row --
  // the level must not have dropped yet.
  state = advanceLeverState(config, state, false)
  assert.equal(resolveLever(config, state).difficulty, bumped, 'a single wrong answer should not move the level yet')
  // One correct answer immediately after that wrong is also not two-in-a-row.
  state = advanceLeverState(config, state, true)
  assert.equal(resolveLever(config, state).difficulty, bumped, 'one correct after a wrong should not move the level')
})

// Change 3: recorded-as-known-broken bug -- the old +-1-per-answer ramp let a
// strong student hit DIFFICULTY_MAX a few questions into a rapid round, then
// play the rest of the round with zero adaptation. This asserts the fix: a
// strong-but-human player (mostly correct, with isolated misses that break a
// streak without themselves being a second consecutive wrong) is still below
// the ceiling partway through a 10-question rapid round.
test('adaptive lever: difficulty no longer saturates mid-round for a strong player', () => {
  const config: GameConfig = { mode: 'rapid', lever: 'adaptive', fixedDifficulty: 3 }
  const total = roundLength(config.mode)
  const STRONG = [true, true, true, true, false, true, true, true, true, true]
  assert.equal(STRONG.length, total, 'fixture must cover a full rapid round')
  let state = initialLeverState(config)
  const seenFirstHalf: number[] = []
  for (let i = 0; i < STRONG.length; i++) {
    if (i < total / 2) seenFirstHalf.push(resolveLever(config, state).difficulty)
    state = advanceLeverState(config, state, STRONG[i])
  }
  assert.ok(
    seenFirstHalf.some((d) => d < DIFFICULTY_MAX),
    `expected difficulty still below the ceiling partway through the round, saw ${seenFirstHalf}`
  )
})

// FIX 4 (A1 rework): resolveLever's default ('item') behaviour must be
// completely unchanged -- the quiz's call sites never pass a profile, so a
// regression here would silently retime every MCQ.
test('resolveLever with no profile behaves exactly as before (item timing)', () => {
  const config: GameConfig = { mode: 'normal', lever: 'time', fixedDifficulty: 3 }
  let state = initialLeverState(config)
  assert.equal(resolveLever(config, state).timeLimit, TIME_BASE)
  state = advanceLeverState(config, state, true)
  assert.equal(resolveLever(config, state).timeLimit, resolveLever(config, state, 'item').timeLimit)
})

// FIX 4: the whole reason this profile exists -- TIME_BASE (10s) is unplayable
// for a six-pair board, so the 'board' profile must use the much larger
// BOARD_TIME_* constants instead, for BOTH branches of the lever switch
// (adaptive pins the base, time ramps it down).
test('resolveLever board profile: adaptive lever pins the BOARD base, not the item base', () => {
  const config: GameConfig = { mode: 'normal', lever: 'adaptive', fixedDifficulty: 3 }
  const state = initialLeverState(config)
  const { timeLimit } = resolveLever(config, state, 'board')
  assert.equal(timeLimit, BOARD_TIME_BASE)
  assert.notEqual(timeLimit, TIME_BASE)
})

test('resolveLever board profile: time lever ramps down using the BOARD step/min, never below BOARD_TIME_MIN', () => {
  const config: GameConfig = { mode: 'normal', lever: 'time', fixedDifficulty: 3 }
  let state = initialLeverState(config)
  assert.equal(resolveLever(config, state, 'board').timeLimit, BOARD_TIME_BASE)
  // Enough consecutive correct boards to hit the floor.
  for (let i = 0; i < 10; i++) state = advanceLeverState(config, state, true)
  const { timeLimit } = resolveLever(config, state, 'board')
  assert.equal(timeLimit, BOARD_TIME_MIN)
  assert.ok(timeLimit >= BOARD_TIME_MIN)
  // One correct answer in is one BOARD_TIME_STEP off the base, not the item step.
  let one = initialLeverState(config)
  one = advanceLeverState(config, one, true)
  assert.equal(resolveLever(config, one, 'board').timeLimit, BOARD_TIME_BASE - BOARD_TIME_STEP)
})

test('resolveLever board profile: difficulty is unaffected by profile (only timing differs)', () => {
  const config: GameConfig = { mode: 'normal', lever: 'adaptive', fixedDifficulty: 3 }
  let state = initialLeverState(config)
  state = advanceLeverState(config, state, true)
  state = advanceLeverState(config, state, true)
  assert.equal(resolveLever(config, state).difficulty, resolveLever(config, state, 'board').difficulty)
})
