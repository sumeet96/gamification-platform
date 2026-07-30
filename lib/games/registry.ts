// Package K-2: the single source of truth for what games exist and how they
// score. The dashboard reads this to render tiles, the scorer reads it for
// points, each game reads its own row. Nothing else should hardcode a point
// value or a lever/granularity fact — that's how five files quietly disagree.
//
// EVERY POINTS VALUE BELOW IS A PLACEHOLDER PENDING PROF. SINGH'S SIGN-OFF
// (docs/PROJECT_MAP.md §1, "The points table"). The machinery is real; the
// numbers are not.

export type Primitive = 'mcq' | 'term_definition'
export type AdaptGranularity = 'item' | 'board'

/**
 * Whether a game honours the student's chosen lever at all.
 *
 * Deliberately NOT called `Lever` — `lib/game/engine.ts` already exports a
 * `Lever` type meaning something completely different (`'adaptive' | 'time'`,
 * i.e. WHICH lever the student picked). Two same-named types with different
 * meanings, in sibling directories that differ by one letter (`lib/game/` vs
 * `lib/games/`), is how someone imports the wrong one and TypeScript says
 * nothing useful.
 */
export type LeverSupport = 'both' | 'none'

/** Flat per-answer scoring: the shape every item game except Wordle uses. */
export interface FlatPoints {
  kind: 'flat'
  correct: number
  wrong: number // zero or negative — a positive value here would reward wrong answers
}

/**
 * Wordle scores on guess count, not a flat correct/wrong, so it gets its own
 * shape rather than being forced into FlatPoints. `byGuessCount[i]` is the
 * payout for solving in `i + 1` guesses; `miss` is the payout for not
 * solving within the deck's max guesses. No negative marking either way.
 */
export interface GuessCountPoints {
  kind: 'guessCount'
  byGuessCount: readonly number[]
  miss: number
}

export type Points = FlatPoints | GuessCountPoints

export interface GameEntry {
  id: string
  displayName: string
  primitive: Primitive
  lever: LeverSupport
  adaptGranularity: AdaptGranularity
  points: Points
  enabled: boolean
}

// Judgment call: solving in 1 or 2 guesses both pay the max — a 1-guess
// solve is luck, not skill, so it doesn't need to outrank 2. Then it steps
// down to the +10 floor by guess 6, per PROJECT_MAP §1 ("+40 down to +10").
const WORDLE_POINTS: GuessCountPoints = {
  kind: 'guessCount',
  byGuessCount: [40, 40, 30, 22, 15, 10],
  miss: 0,
}

export const GAME_REGISTRY: readonly GameEntry[] = [
  {
    id: 'quiz-normal',
    displayName: 'Quiz — Normal',
    primitive: 'mcq',
    lever: 'both',
    adaptGranularity: 'item',
    points: { kind: 'flat', correct: 20, wrong: -10 },
    enabled: true,
  },
  {
    id: 'quiz-rapid',
    displayName: 'Quiz — Rapid',
    primitive: 'mcq',
    lever: 'both',
    adaptGranularity: 'item',
    points: { kind: 'flat', correct: 20, wrong: -10 },
    enabled: true,
  },
  {
    id: 'match',
    displayName: 'Match the Following',
    primitive: 'term_definition',
    lever: 'both',
    adaptGranularity: 'board',
    points: { kind: 'flat', correct: 15, wrong: -5 }, // per pair
    enabled: false, // not yet built (WP A1)
  },
  {
    id: 'fill-blanks',
    displayName: 'Fill in the Blanks',
    primitive: 'term_definition',
    lever: 'both',
    adaptGranularity: 'item',
    points: { kind: 'flat', correct: 15, wrong: -5 },
    enabled: false, // not yet built (WP A2)
  },
  {
    id: 'choose-word',
    displayName: 'Choose the Right Word',
    primitive: 'term_definition',
    lever: 'both',
    adaptGranularity: 'item',
    points: { kind: 'flat', correct: 15, wrong: -5 },
    enabled: false, // not yet built (WP A3)
  },
  {
    id: 'wordle',
    displayName: 'Wordle',
    primitive: 'term_definition',
    lever: 'none', // one board/day — the lever would fire 24h apart, not adaptivity
    adaptGranularity: 'board',
    points: WORDLE_POINTS,
    enabled: false, // not yet built (WP A4)
  },
]

/** Look up a game by id. Throws rather than returning undefined — a silent
 * undefined here would mean a game silently scoring zero in production. */
export function getGame(id: string): GameEntry {
  const entry = GAME_REGISTRY.find((g) => g.id === id)
  if (!entry) {
    throw new Error(`Unknown game id: "${id}"`)
  }
  return entry
}
