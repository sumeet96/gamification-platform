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

/**
 * Board-grained scoring: per-pair accrual totalled and paid out ONCE at board end,
 * plus a bonus for a clean board and a floor penalty for a failed one. Used by
 * match-the-following.
 *
 * Why not FlatPoints with a per-pair `wrong`: on a bijection board the number of
 * correct pairs is the fixed-point count of a permutation, so a single mistake
 * always drags at least one other pair down with it — out of 6 you can score
 * 6, 4, 3, 2, 1 or 0, but never 5. A per-pair penalty therefore bills one error
 * twice. The structural double-cost IS the penalty; `perfectBonus` supplies the
 * reward gradient instead of negative marking.
 *
 * `floorPenalty` is not decoration: a random permutation has exactly 1 expected
 * fixed point at ANY board size, so accrual alone would pay `perPair` for pure
 * guessing. The floor is what makes guessing negative-EV.
 */
export interface BoardPoints {
  kind: 'board'
  perPair: number
  perfectBonus: number
  floorAtOrBelow: number // correct-pair count at or below which floorPenalty applies
  floorPenalty: number // zero or negative — positive would reward failing a board
}

/**
 * Board-grained scoring for a partition game (Connections): 4 groups of 4, a
 * mistake budget instead of a per-item wrong answer. `BoardPoints` above
 * doesn't fit — there is no "correct-pair count" here, and a mistake budget
 * that runs out mid-board has no home in it.
 *
 * Same double-billing trap as `BoardPoints`, restated for this shape:
 * `mistakePenalty` is charged per WRONG GUESS, never per tile. A four-tile
 * guess is one decision — a student who guesses [A, B, C, D] and is wrong
 * made one mistake, not four, even though four tiles were "involved".
 *
 * `floorPenalty` here is doing a different job than `BoardPoints.floorPenalty`
 * does for match. On a match board a random permutation has exactly 1
 * expected fixed point, so the floor exists to defeat an accrual exploit —
 * without it, guessing pays. On a Connections board there are C(16,4) = 1820
 * possible four-tile guesses; blind guessing essentially never lands a group,
 * so there is no accrual exploit to defeat. The floor here is about
 * discouraging give-up behaviour (stop trying once the mistake budget is
 * clearly lost) rather than about making random play negative-EV — random
 * play is already worthless without any floor at all.
 */
export interface PartitionBoardPoints {
  kind: 'partition'
  perGroup: number // per correctly submitted group
  perfectBonus: number // zero mistakes
  mistakePenalty: number // per WRONG GUESS, never per tile — zero or negative
  maxMistakes: number // 4
  floorAtOrBelow: number // groups-solved count at or below which floorPenalty applies
  floorPenalty: number // zero or negative — positive would reward giving up
}

/**
 * Board-grained scoring for crossword: per-entry (word) accrual paid once at
 * grid completion, plus a clean-grid bonus and a floor penalty. Shares the
 * accrual+bonus+floor SHAPE with BoardPoints/PartitionBoardPoints, but reuse
 * of either was rejected: BoardPoints' floor is derived from match's specific
 * permutation-fixed-point argument (a random bijection has exactly 1 expected
 * fixed point), which does not describe a crossword grid at all, and
 * `perPair` is the wrong noun for "correct word entries". PartitionBoardPoints
 * is shaped around a mistake BUDGET, which crossword has no equivalent of yet.
 *
 * PLACEHOLDER SHAPE, not just placeholder numbers — scoring economics for
 * crossword were never answered. game4-rfc-prompt.md section 5 asked
 * explicitly ("cover partial completion, hints, revision, and whether
 * guessing must be negative-EV") and the RFC picked Connections before any
 * model answered it. In particular: crossword crossings create the same kind
 * of coupling match's and Connections' floors exist to handle — a wrong
 * letter at a shared intersection can invalidate more than one entry — but
 * nobody has derived the reachable-score set for a real grid's intersection
 * graph the way match's "6,4,3,2,1,0, never 5" was derived. Treat
 * `floorAtOrBelow`/`floorPenalty` here as unverified until that design pass
 * happens, not as confirmed negative-EV the way match's and Connections' are.
 */
export interface GridPoints {
  kind: 'grid'
  perEntry: number
  perfectBonus: number
  floorAtOrBelow: number
  floorPenalty: number
}

export type Points = FlatPoints | GuessCountPoints | BoardPoints | PartitionBoardPoints | GridPoints

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
    // Paid once per board: 15 x correct pairs, +30 if the board is clean, -20 if
    // 2 or fewer land. See BoardPoints above for why there is no per-pair penalty.
    points: { kind: 'board', perPair: 15, perfectBonus: 30, floorAtOrBelow: 2, floorPenalty: -20 },
    enabled: true, // WP A1 shipped: app/games/match/page.tsx + app/api/match/*
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
    enabled: true, // WP A3 shipped: app/games/word/page.tsx + app/api/word/*
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
  {
    id: 'connections',
    displayName: 'Connections',
    primitive: 'term_definition',
    // Deliberate, not an oversight — confirmed by the user 6 Aug 2026
    // (docs/NEXT_SESSION_BUILD_BRIEF.md §6). No clock (BOARD_TIME_BASE was
    // sized for a 6-pair match board, not a 16-tile taxonomy search — getting
    // that number right needs a timing study this build doesn't have time
    // for) and no difficulty tiebreak (no term_definition row has a
    // difficulty value yet, so there is nothing to sort on). Both stay
    // parked behind this flag, not deleted, per CLAUDE.md's standing
    // machinery-retention rule.
    lever: 'none',
    adaptGranularity: 'board',
    // Paid once per board: 20 x groups solved, +20 if zero mistakes, -10 per
    // wrong guess (never per tile), -30 if the mistake budget is exhausted
    // with 1 or fewer groups solved. See PartitionBoardPoints above for why
    // there is no per-tile penalty and why the floor here is about
    // discouraging give-up rather than defeating an accrual exploit.
    points: {
      kind: 'partition',
      perGroup: 20,
      perfectBonus: 20,
      mistakePenalty: -10,
      maxMistakes: 4,
      floorAtOrBelow: 1,
      floorPenalty: -30,
    },
    // Routes, page and one authored board (b1-data-ai, 4 groups / 16 tiles,
    // loaded 7 Aug 2026) are all live, so the tile renders. Board ROTATION is
    // content-blocked, not engine-blocked: least-recently-served selection is
    // built and tested, it currently has exactly one board to choose from, so
    // a second round re-serves the same 16 tiles. Board 2 is blocked on an
    // unregistered source deck (design thinking / six thinking hats).
    enabled: true,
  },
  {
    id: 'crossword',
    displayName: 'Crossword',
    primitive: 'term_definition',
    // Declared 'both', deliberately NOT consumed yet — decided by the user
    // 7 Aug 2026 specifically to keep crossword eligible as a future study
    // arm once the between-arm contrast (AGENTS.md's standing top blocker) is
    // resolved, unlike Connections' lever:'none' (which forecloses that
    // permanently). See docs/architecture/games-and-content-findings.md and
    // DECISIONS.md, "Crossword's lever, 7 Aug 2026".
    //
    // HARD CONSTRAINT tied to `enabled` below: do not flip this game live
    // while `lever: 'both'` is declared but unread. resolveLever() (lib/
    // game/engine.ts) is the one chokepoint every game is supposed to consume
    // — an enabled game that never reads its resolved (difficulty, timeLimit)
    // would log events claiming a lever was active when nothing enforced it,
    // the same class of defect as a client-supplied score.
    lever: 'both',
    adaptGranularity: 'board',
    // PLACEHOLDER shape and numbers — see GridPoints' docstring above.
    // Scoring economics for crossword are undesigned (game4-rfc-prompt.md
    // section 5), not just unsigned-off-on like every other row's numbers.
    points: { kind: 'grid', perEntry: 15, perfectBonus: 25, floorAtOrBelow: 1, floorPenalty: -15 },
    // Kept false deliberately, not because nothing works yet. The
    // crossing-density objection that killed crossword on 6 Aug is
    // spike-resolved (scripts/spike-crossword-density.mjs: 46.5% fill on the
    // full live bank, 43.5%/44.6% at realistic single-deck board scale,
    // against the RFC's own cited <25% freeform-generator floor) — see
    // games-and-content-findings.md, 7 Aug 2026. What remains open and
    // genuinely blocks enabling this: no board/grid data model is wired up
    // yet (db/013_add_crossword.sql, not yet applied), no routes or page
    // exist, the mobile pan-and-zoom viewport is unbuilt, and the
    // lever/difficulty mechanic this entry's `lever: 'both'` promises does
    // not exist. Do not flip true piecemeal — see the comment on `lever`
    // above for why a half-wired lever is worse than no lever.
    enabled: false,
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
