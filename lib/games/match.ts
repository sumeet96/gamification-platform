// Package A1: pure comparison + scoring logic for match-the-following. Framework-free
// and DB-free so it is testable in isolation and reusable by the submit route.
//
// The board is a BIJECTION: n clues, n terms, every term used exactly once, no
// distractors. That is a deliberate design choice with a scoring consequence — the
// number of correct pairs is the fixed-point count of a permutation, so a single
// mistake always drags at least one other pair down with it (out of 6 you can score
// 6, 4, 3, 2, 1 or 0, but never 5). See BoardPoints in ./registry for why that rules
// out per-pair negative marking.
//
// The `distractors` column on content_items is deliberately unused here — it exists
// for choose-the-right-word and fill-in-the-blanks, which have no other source of
// wrong options. Padding this board with them would break the bijection.

import type { BoardPoints } from './registry'

/** Pairs per board. Six fits a phone screen in two columns without scrolling and is
 *  small enough that a wrong pair is diagnosable in the event log. */
export const BOARD_SIZE = 6

/** One (clue, term) pair as the SERVER knows it. `term` and `variants` are the answer
 *  key: never serialise a BoardPair to the client before the board is submitted. */
export interface BoardPair {
  itemId: string
  clue: string
  term: string
  variants: string[]
}

export interface PairResult {
  itemId: string
  correct: boolean
  submitted: string | null
  term: string // revealed in the submit response only, i.e. after the board is scored
}

export interface ScoredBoard {
  total: number
  correctCount: number
  accrual: number // perPair x correctCount
  bonus: number // perfectBonus, or 0
  floor: number // floorPenalty, or 0
  net: number
  potential: number
  perfect: boolean
  pairs: PairResult[]
}

/** Compare-time normalisation: case, quote style, and punctuation/whitespace only.
 *  Deliberately NOT stemming or fuzzy matching — "which other spellings count" is a
 *  content decision that belongs in the item's `variants` column where a human can
 *  audit it, not in a similarity threshold nobody can inspect after the fact. */
export function normaliseTerm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** True when `submitted` is this pair's term or one of its declared variants. A missing,
 *  null or blank submission is wrong, never an error — an unfilled slot is a legitimate
 *  student action (and the time lever can end a board mid-fill). */
export function matchesTerm(submitted: string | null | undefined, pair: BoardPair): boolean {
  if (typeof submitted !== 'string') return false
  const s = normaliseTerm(submitted)
  if (s === '') return false
  if (s === normaliseTerm(pair.term)) return true
  return pair.variants.some((v) => normaliseTerm(v) === s)
}

/** Score a submitted board. `submission` maps item id -> the term string the student put
 *  against that clue. Pure: it reads nothing but its arguments, so the submit route can
 *  be trusted to produce the same number the tests assert. */
export function scoreBoard(
  pairs: readonly BoardPair[],
  submission: Readonly<Record<string, string | null>>,
  points: BoardPoints
): ScoredBoard {
  const results: PairResult[] = pairs.map((p) => {
    const submitted = typeof submission[p.itemId] === 'string' ? (submission[p.itemId] as string) : null
    return { itemId: p.itemId, correct: matchesTerm(submitted, p), submitted, term: p.term }
  })

  const total = pairs.length
  const correctCount = results.filter((r) => r.correct).length
  const perfect = total > 0 && correctCount === total
  const accrual = correctCount * points.perPair
  const bonus = perfect ? points.perfectBonus : 0
  const floor = total > 0 && correctCount <= points.floorAtOrBelow ? points.floorPenalty : 0

  return {
    total,
    correctCount,
    accrual,
    bonus,
    floor,
    net: accrual + bonus + floor,
    // Mirrors the two-view convention in lib/game/engine.ts: `potential` is the
    // no-penalty view. The floor is this game's only penalty, so it is the only
    // term dropped.
    potential: accrual + bonus,
    perfect,
    pairs: results,
  }
}

/** Did this board count as a success for the adaptivity lever? STRICTLY more than half
 *  the pairs. This is the board-grained analogue of one correct answer in the quiz, and
 *  it sits on the same side of the board as the points floor: with the shipped numbers a
 *  board can never both ramp difficulty up and charge the failure penalty. */
export function boardSucceeded(correctCount: number, total: number): boolean {
  return total > 0 && correctCount * 2 > total
}
