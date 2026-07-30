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
