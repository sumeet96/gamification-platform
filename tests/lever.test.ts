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
