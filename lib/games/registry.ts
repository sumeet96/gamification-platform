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
 *
 * `'time'` added 8 Aug 2026 for crossword: a THIRD case, distinct from
 * `'both'` (student picks either lever) and `'none'` (neither lever applies
 * at all). A game declares `'time'` when time pressure is meaningful but
 * difficulty structurally is not — crossword's grid is pre-authored and
 * fixed, so there is nothing for an adaptive-difficulty ranking to act on,
 * but a full-board completion clock is still a real, gameable signal. See
 * the crossword entry below and Wordle's `'none'` entry for the sibling
 * refusal-on-structural-grounds case this generalises from.
 */
export type LeverSupport = 'both' | 'none' | 'time'

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
 * grid completion, plus a clean-grid bonus and a consumable check budget.
 * DESIGNED 7 Aug 2026 (explicit user design session) — this is no longer the
 * placeholder shape from earlier the same day; game4-rfc-prompt.md section 5
 * ("cover partial completion, hints, revision, and whether guessing must be
 * negative-EV") is now answered. Full reasoning:
 * docs/architecture/games-and-content-findings.md.
 *
 * Deliberately its own shape, not reused from BoardPoints or
 * PartitionBoardPoints: neither's floor-penalty proof transfers to a
 * crossword grid (BoardPoints' floor comes from match's permutation
 * fixed-point argument; PartitionBoardPoints is shaped around a mistake
 * BUDGET that gates further play, which crossword doesn't have). Crossword
 * doesn't need a floor at all — `perWrong < 0 = notAttempted's implicit 0 <
 * perEntry` already makes blind guessing strictly worse than leaving a blank,
 * the same negative-EV-for-guessing property match's and Connections' floors
 * exist to create, for free from the per-entry rate alone.
 *
 * `perWrong` only applies to a FULLY FILLED, incorrect entry — see
 * lib/games/crossword.ts's `gradeEntry`. A down entry left partially filled
 * as spillover from crossing across answers is 'not_attempted' (contributes
 * 0), never billed as wrong. Residual, ACCEPTED not fixed: two crossing
 * entries that are BOTH fully filled and share a wrong letter at the
 * intersection can both grade wrong off that one mistake — a real
 * double-bill, deliberately left as-is (see crossword.ts's `gradeEntry`
 * docstring) rather than solved with a second rule.
 *
 * `perfectBonus` requires zero wrong AND zero not-attempted — a board with
 * unattempted entries never qualifies even with nothing wrong submitted; the
 * bonus is for a FULLY solved board, not merely a mistake-free partial one.
 *
 * The check budget (`checkBudgetDivisor`) is a consumable per-board hint
 * allowance of `floor(entryCount / checkBudgetDivisor)` — e.g. 3 on a
 * 10-entry board at the decided divisor of 3. Spending a check reveals
 * whether one entry's current fill is correct; it costs nothing directly and
 * does not lock the entry from further edits. The only cost is forgone
 * `perUnusedCheck` reward on whatever was spent, linear per unused check
 * (using 1 of 3 still pays for the other 2) — see lib/games/crossword.ts's
 * `checkBudget`/`scoreBoard`.
 *
 * `maxTimeBonus` (added 8 Aug 2026, crossword's time-lever slice): full
 * payout while the board is completed within the server-resolved time-lever
 * window, decaying LINEARLY to zero over a further window's worth of time —
 * see lib/games/crossword.ts's `timeBonusFor`. The window itself is NOT a
 * points constant and does not live here — it comes from
 * lib/game/engine.ts's `resolveLever(config, state, 'grid')`, reconstructed
 * server-side per student from recent play history
 * (lib/games/crossword-lever.ts), never authored as a fixed value the way
 * `perEntry`/`perfectBonus`/etc. are.
 */
export interface GridPoints {
  kind: 'grid'
  perEntry: number
  perWrong: number // zero or negative — a positive value here would reward a wrong answer
  perfectBonus: number
  checkBudgetDivisor: number // budget = floor(entryCount / this)
  perUnusedCheck: number
  maxTimeBonus: number // full time-bonus payout inside the resolved window — see docstring above
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
    // TIME-LEVER-ONLY, decided 8 Aug 2026. Crossword never manipulates
    // difficulty: the grid is pre-authored and fixed at authoring time, so
    // there is no per-item difficulty to rank or ramp — the whole grid is
    // the unit, not any one entry, and inventing a per-board difficulty
    // score would mean ASSERTING difficulty rather than measuring it, which
    // AGENTS.md's "difficulty is empirical, never asserted" rule forbids.
    // Wordle's `lever: 'none'` below is the in-repo precedent for refusing a
    // lever on structural grounds; crossword differs only in which half of
    // the pair is refused — Wordle forecloses both time and difficulty (one
    // board/day), crossword forecloses difficulty only and keeps time.
    //
    // Server side: app/api/crossword/submit/route.ts reconstructs a
    // LeverState from this student's own recent crossword `board_complete`
    // history (bounded lookback — lib/games/crossword.ts's
    // CROSSWORD_LEVER_LOOKBACK) via lib/game/engine.ts's
    // `reconstructLeverState`, resolves it through
    // `resolveLever(config, state, 'grid')`, and uses the returned
    // `timeLimit` as the full-bonus window for `points.maxTimeBonus` below.
    // Client side: app/games/crossword/page.tsx shows a count-up clock and a
    // decaying bonus against that same window — this was the condition that
    // blocked enabling, and it is now built and browser-verified against
    // live Neon (docs/CURRENT_STATE.md).
    lever: 'time',
    adaptGranularity: 'board',
    // Numbers are the file's usual PLACEHOLDER-pending-sign-off (see the file
    // header) — but the SHAPE is decided: +10 per correct entry, -5 per wrong
    // (fully-filled-but-incorrect) entry, +25 clean-board bonus (zero wrong
    // AND zero not-attempted), a 3-entry check budget with +2 per unused
    // check (7 Aug 2026 design session), plus (8 Aug 2026, this slice) up to
    // +20 for finishing inside the resolved time window, decaying linearly
    // to 0 over a further window's worth of time. +20 is sized against the
    // live 22-entry board's ~220-point full-grid accrual (22 x perEntry) —
    // comparable to perfectBonus (25) and to the max checkBonus
    // (floor(22/3) x 2 = 14), not dominant over either. See GridPoints'
    // docstring above and lib/games/crossword.ts for the grading/scoring
    // implementation.
    points: {
      kind: 'grid',
      perEntry: 10,
      perWrong: -5,
      perfectBonus: 25,
      checkBudgetDivisor: 3,
      perUnusedCheck: 2,
      maxTimeBonus: 20,
    },
    // Enabled 8 Aug 2026. The crossing-density objection that killed
    // crossword on 6 Aug is spike-resolved (scripts/spike-crossword-density.mjs:
    // 46.5% fill on the full live bank, 43.5%/44.6% at realistic
    // single-deck board scale, against the RFC's own cited <25%
    // freeform-generator floor); board/grid data model (db/013), crossword's
    // events columns (db/014) and the lever's column (db/015) are applied
    // live; routes, page, one authored board (22 entries), scoring, the
    // server-side lever, and the client countdown are all built, reviewed in
    // two independent passes, and browser-verified against live Neon
    // (docs/CURRENT_STATE.md).
    enabled: true,
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
