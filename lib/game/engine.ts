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

// Board-grained timing (FIX 4, A1 rework): six clue/term placements cannot be
// timed like one MCQ -- TIME_BASE (10s) made every match board time out, so
// boardSucceeded was never true, streak never advanced, and the time lever
// was permanently pinned. PLACEHOLDERS pending Prof. Singh's sign-off, per
// docs/PROJECT_MAP.md §1 (90 -> 60 -> 45s), exactly like lib/games/registry.ts
// flags its points as placeholders.
export const BOARD_TIME_BASE = 90 // seconds, first board in time mode
export const BOARD_TIME_MIN = 45
export const BOARD_TIME_STEP = 15 // seconds shaved per consecutive correct board

export function roundLength(mode: Mode): number {
  return mode === 'rapid' ? 10 : 20
}

/** The GAME_REGISTRY id (lib/games/registry.ts) that matches a quiz mode. Every
 *  quiz event must log this as `game_type`, not a bare 'quiz' literal — the
 *  per-game stats query (app/api/stats/route.ts) groups by game_type and the
 *  dashboard looks tiles up by registry id, so a mismatched literal means the
 *  tile can never find its own rows. */
export function quizGameId(mode: Mode): string {
  return mode === 'rapid' ? 'quiz-rapid' : 'quiz-normal'
}

/** Points deltas for one answered question. Wrong answers cost `net` but never `potential`. */
export function scoreDelta(correct: boolean): { net: number; potential: number } {
  return correct
    ? { net: POINTS_CORRECT, potential: POINTS_CORRECT }
    : { net: -PENALTY_WRONG, potential: 0 }
}

/** Signed run-length: positive while a correct streak continues, negative while
 *  a wrong streak continues; flips sign (never straddles zero) the instant
 *  correctness changes. Feeds the two-consecutive rule in `nextDifficulty` below
 *  (Change 3) -- reuses the same `streak` field on `LeverState` rather than
 *  adding a parallel counter, so the adaptive branch of `advanceLeverState`
 *  gives it this signed meaning while the time branch keeps its old
 *  reset-on-wrong meaning (see that branch for why). */
function nextStreak(streak: number, correct: boolean): number {
  if (correct) return streak > 0 ? streak + 1 : 1
  return streak < 0 ? streak - 1 : -1
}

/** Adaptive mode: the level moves only once a run of TWO CONSECUTIVE
 *  same-direction answers completes (Change 3) -- `consecutive` is the
 *  unsigned run length after this answer (2, 4, 6... for two-, four-,
 *  six-in-a-row). A single correct answer right after a wrong one (or vice
 *  versa) leaves the level untouched, which is what stops adaptive difficulty
 *  saturating a handful of questions into a round. Capped/floored as before. */
export function nextDifficulty(current: number, correct: boolean, consecutive: number): number {
  if (consecutive % 2 !== 0) return current
  const d = correct ? current + 1 : current - 1
  return Math.max(DIFFICULTY_MIN, Math.min(DIFFICULTY_MAX, d))
}

// Which per-round clock a game is on. Not a second lever -- both branches of
// resolveLever below still decide difficulty vs time; this only picks WHICH
// pair of constants ('item' MCQ timing vs 'board' whole-board timing) the time
// branch reads. Lives here, not as a parallel resolver, so the single-lever
// chokepoint (see resolveLever) still holds for every granularity.
export type TimingProfile = 'item' | 'board'

/** Time allowed for the NEXT question (profile 'item') or NEXT board (profile
 *  'board'), given the current correct streak. Defaults to 'item' so every
 *  existing call site (the quiz) is unaffected. */
export function timeForStreak(consecutiveCorrect: number, profile: TimingProfile = 'item'): number {
  if (profile === 'board') {
    return Math.max(BOARD_TIME_MIN, BOARD_TIME_BASE - BOARD_TIME_STEP * consecutiveCorrect)
  }
  return Math.max(TIME_MIN, TIME_BASE - TIME_STEP * consecutiveCorrect)
}

// --- Lever resolver ---------------------------------------------------
// The one place that is allowed to know both levers exist. A game calls
// resolveLever() and gets back a (difficulty, timeLimit) pair where exactly
// one field tracks performance and the other is pinned to a constant — so
// consuming code cannot accidentally honour both levers at once, even if
// its author forgets the "one lever per student" rule.

export interface LeverState {
  difficulty: number
  streak: number
}

/** Starting state for a student's chosen lever.
 *  Written as an exhaustive switch (Change 2), not `config.lever === 'adaptive' ? A : B`
 *  -- the `default` branch assigns `config.lever` to a `never`-typed variable, so
 *  adding a third `Lever` member is a COMPILE ERROR here, not a silent fall-through
 *  into the time-mode branch. */
export function initialLeverState(config: GameConfig): LeverState {
  switch (config.lever) {
    case 'adaptive':
      return { difficulty: START_DIFFICULTY, streak: 0 }
    case 'time':
      return { difficulty: config.fixedDifficulty, streak: 0 }
    default: {
      const exhaustive: never = config.lever
      throw new Error(`initialLeverState: unhandled lever ${exhaustive}`)
    }
  }
}

/** Difficulty + time limit for the next question (or board, see `profile`),
 *  given the lever and current state. Exhaustive switch, see `initialLeverState`
 *  above for why.
 *
 *  `profile` (Change, FIX 4) extends this same chokepoint to board-grained
 *  games rather than adding a parallel resolver: it only selects which pinned
 *  base / which timeForStreak curve the 'time' logic reads. A game still never
 *  branches on `config.lever` itself -- match passes `profile: 'board'`, the
 *  quiz omits it and gets the unchanged 'item' behaviour. */
export function resolveLever(
  config: GameConfig,
  state: LeverState,
  profile: TimingProfile = 'item'
): { difficulty: number; timeLimit: number } {
  switch (config.lever) {
    case 'adaptive':
      return { difficulty: state.difficulty, timeLimit: profile === 'board' ? BOARD_TIME_BASE : TIME_BASE }
    case 'time':
      return { difficulty: config.fixedDifficulty, timeLimit: timeForStreak(state.streak, profile) }
    default: {
      const exhaustive: never = config.lever
      throw new Error(`resolveLever: unhandled lever ${exhaustive}`)
    }
  }
}

/** Advance the lever state after one answered question. Exhaustive switch, see
 *  `initialLeverState` above for why.
 *  Adaptive branch: `streak` carries the SIGNED run length from `nextStreak`
 *  (Change 3), consumed by `nextDifficulty`'s two-consecutive rule.
 *  Time branch: `streak` keeps its original meaning -- an unsigned consecutive-
 *  correct count that resets to 0 on any wrong answer -- because `timeForStreak`
 *  needs exactly that, not a signed run length. Same field, different meaning
 *  per lever; the two branches never see each other's state. */
export function advanceLeverState(config: GameConfig, state: LeverState, correct: boolean): LeverState {
  switch (config.lever) {
    case 'adaptive': {
      const streak = nextStreak(state.streak, correct)
      return { difficulty: nextDifficulty(state.difficulty, correct, Math.abs(streak)), streak }
    }
    case 'time':
      return { difficulty: state.difficulty, streak: correct ? state.streak + 1 : 0 }
    default: {
      const exhaustive: never = config.lever
      throw new Error(`advanceLeverState: unhandled lever ${exhaustive}`)
    }
  }
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
  round: number // the round number this summary belongs to (1-indexed) — the single
  // source of truth for round_stop logging on the results screen, so it doesn't have
  // to re-derive it from session.roundsPlayed after the fact.
}
