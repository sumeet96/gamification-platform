// Pure game logic for the prof's mechanic (27 Jul spec):
// - FIXED points per correct answer + NEGATIVE marking on wrong.
// - Two point views: "net" (with penalties) and "potential" (no-penalty, correct-only).
// - Student chooses ONE challenge lever: adaptive difficulty OR time pressure.
//   * adaptive: difficulty ramps (correct -> harder, wrong -> easier); time is not the pressure.
//   * time:     difficulty fixed; time-per-question ramps down as the streak grows.
// Kept pure + framework-free so it's testable and reusable.

export type Mode = 'rapid' | 'normal'
export type Lever = 'adaptive' | 'time'

export interface GameConfig {
  mode: Mode
  lever: Lever
  fixedDifficulty: number // used when lever === 'time'
}

export const POINTS_CORRECT = 20
export const PENALTY_WRONG = 10

export const DIFFICULTY_MIN = 1
export const DIFFICULTY_MAX = 5
export const START_DIFFICULTY = 2 // adaptive mode starts here
export const FIXED_DIFFICULTY = 3 // default difficulty for time mode

export const TIME_BASE = 10 // seconds, first question in time mode
export const TIME_MIN = 5
export const TIME_STEP = 2 // seconds shaved per consecutive correct

export function roundLength(mode: Mode): number {
  return mode === 'rapid' ? 10 : 20
}

/** Points deltas for one answered question. Wrong answers cost `net` but never `potential`. */
export function scoreDelta(correct: boolean): { net: number; potential: number } {
  return correct
    ? { net: POINTS_CORRECT, potential: POINTS_CORRECT }
    : { net: -PENALTY_WRONG, potential: 0 }
}

/** Adaptive mode: correct -> +1 level (capped), wrong -> -1 level (floored). */
export function nextDifficulty(current: number, correct: boolean): number {
  const d = correct ? current + 1 : current - 1
  return Math.max(DIFFICULTY_MIN, Math.min(DIFFICULTY_MAX, d))
}

/** Time mode: seconds allowed for the NEXT question given the current correct streak. */
export function timeForStreak(consecutiveCorrect: number): number {
  return Math.max(TIME_MIN, TIME_BASE - TIME_STEP * consecutiveCorrect)
}

export interface RoundSummary {
  net: number
  potential: number
  correct: number
  wrong: number
  answered: number
  peakDifficulty: number
  bestTimeMs: number | null // fastest correct answer (time mode)
  lever: Lever
  mode: Mode
}
