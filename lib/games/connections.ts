// Package A5: pure comparison + scoring logic for Connections. Framework-free
// and DB-free, same reason as lib/games/match.ts — testable in isolation and
// reusable by the (not-yet-built) submit route. See
// docs/NEXT_SESSION_BUILD_BRIEF.md for the full spec this file implements.
//
// Scope note: this file is pure logic ONLY. No routes, no React, no
// @neondatabase/serverless import — those are a separate task. It must never
// import resolveLever() or read BOARD_TIME_BASE/any TIME_* constant, and must
// never branch on config.lever — this build is lever: 'none' (confirmed by
// the user 6 Aug 2026); the lever chokepoint stays resolveLever() and nowhere
// else, so a game that skips it entirely is the correct shape, not a gap.
//
// A board is a PARTITION, not a bijection like match: 4 groups of 4 tiles,
// every tile in exactly one group. Boards are hand-authored and persisted
// (§2 of the brief), never built at request time — this file only scores and
// evaluates guesses against an already-constructed board.

import { createHash } from 'node:crypto'
import { shuffle } from './item-select.ts'
import type { PartitionBoardPoints } from './registry.ts'

/** One tile on the board, as the SERVER knows it. Never serialise `groupId`
 *  (or anything that reveals group membership) to the client before a group
 *  is solved — the whole point of the game is that the partition is hidden. */
export interface ConnectionsTile {
  contentItemId: string
  text: string
}

/** One of the board's 4 groups. `label` is the category name, revealed to
 *  the client only once this group is solved (§7 of the brief: "no group
 *  ids, no labels, no membership map, no answer key" in the served payload). */
export interface ConnectionsGroup {
  groupId: string
  label: string
  tiles: readonly ConnectionsTile[] // exactly 4
}

export interface ConnectionsBoard {
  boardId: string
  subject: string
  groups: readonly ConnectionsGroup[] // exactly 4
}

/** Why a board ended. Only these three — db/011's `events_terminal_reason_check`
 *  CHECK constraint allows exactly this set. There is deliberately no
 *  `'timeout'`: no clock exists in this build (§6 of the brief). */
export type TerminalReason = 'solved' | 'budget' | 'abandoned'

/**
 * sha256 of the four tile ids, SORTED ASCENDING, hex-encoded. Must be
 * byte-identical to whatever the submit route computes — that route reads
 * this same function rather than reimplementing the hash, so the two can
 * never drift (same reasoning as lib/game/answer-commit.ts being extracted
 * rather than copied). A null-byte separator between ids avoids the
 * concatenation ambiguity a plain join would have (['ab','c'] vs ['a','bc']
 * must not collide) without needing a delimiter that can never legally
 * appear in a content_item id.
 */
export function guessHash(itemIds: readonly string[]): string {
  const sorted = [...itemIds].sort()
  return createHash('sha256').update(sorted.join('\u0000')).digest('hex')
}

export type MalformedGuessReason = 'wrong_count' | 'duplicate_ids' | 'unknown_tile'

export interface GuessEvaluation {
  correct: boolean
  groupId: string | null
  groupOrdinal: number | null
  oneAway: boolean
  /** True only when this guess correctly identifies the group that was
   *  arithmetically forced once the other 3 groups were already solved —
   *  i.e. `groupsSolvedBefore === 3` and this guess is correct. It still
   *  pays normally (see PartitionBoardPoints in ./registry) — this flag
   *  exists only so the caller can set `is_forced` on the group_solved
   *  event, excludable from decision-quality analysis without touching the
   *  economics. Always false on an incorrect or malformed guess. */
  forced: boolean
}

export type GuessOutcome =
  | ({ ok: true } & GuessEvaluation)
  | { ok: false; reason: MalformedGuessReason }

/**
 * Evaluate one four-tile guess against the board. Malformed guesses (not
 * exactly 4 ids, a duplicate id, an id not on this board) are rejected
 * explicitly via `ok: false` rather than scored as a wrong guess — a
 * malformed request never happened as a real decision and must not cost a
 * mistake (§ "Reject malformed guesses explicitly" in the brief).
 *
 * `groupsSolvedBefore` is the count of groups this board had already solved
 * before this guess was submitted (0..3) — the caller's job to track, since
 * this function is stateless. It is only used to compute `forced`.
 */
export function evaluateGuess(
  board: ConnectionsBoard,
  guessedItemIds: readonly string[],
  groupsSolvedBefore = 0
): GuessOutcome {
  if (guessedItemIds.length !== 4) return { ok: false, reason: 'wrong_count' }
  if (new Set(guessedItemIds).size !== 4) return { ok: false, reason: 'duplicate_ids' }

  const tileIndex = new Map<string, { groupId: string; ordinal: number }>()
  board.groups.forEach((g, ordinal) => {
    for (const t of g.tiles) tileIndex.set(t.contentItemId, { groupId: g.groupId, ordinal })
  })

  const memberships = guessedItemIds.map((id) => tileIndex.get(id))
  if (memberships.some((m) => m === undefined)) return { ok: false, reason: 'unknown_tile' }
  const resolved = memberships as Array<{ groupId: string; ordinal: number }>

  const countByGroup = new Map<string, number>()
  for (const m of resolved) countByGroup.set(m.groupId, (countByGroup.get(m.groupId) ?? 0) + 1)
  const maxShared = Math.max(...countByGroup.values())

  const correct = maxShared === 4
  const oneAway = !correct && maxShared === 3
  const matched = correct ? resolved[0] : null

  return {
    ok: true,
    correct,
    groupId: matched ? matched.groupId : null,
    groupOrdinal: matched ? matched.ordinal : null,
    oneAway,
    forced: correct && groupsSolvedBefore === 3,
  }
}

export interface ScoredConnectionsBoard {
  accrual: number // perGroup x groupsSolved
  mistakeCost: number // mistakePenalty x mistakes — never mistakePenalty x 4 x mistakes
  bonus: number // perfectBonus, or 0
  floor: number // floorPenalty, or 0
  net: number
  potential: number // no-penalty view: accrual + bonus, mirrors match's ScoredBoard
  perfect: boolean
}

/**
 * Score a board given how many groups it solved and how many wrong guesses
 * it made. Pure — reads nothing but its arguments, so the submit route can
 * be trusted to reproduce the same number the tests assert.
 *
 * `mistakes` is a count of WRONG GUESSES, never tiles — a four-tile guess is
 * one decision, so `mistakePenalty` is charged once per guess, not four
 * times. See PartitionBoardPoints in ./registry for the full reasoning
 * (the same double-billing trap BoardPoints was designed around for match).
 */
export function scoreBoard(
  groupsSolved: number,
  mistakes: number,
  points: PartitionBoardPoints
): ScoredConnectionsBoard {
  const perfect = groupsSolved === 4 && mistakes === 0
  const accrual = groupsSolved * points.perGroup
  const mistakeCost = mistakes * points.mistakePenalty
  const bonus = perfect ? points.perfectBonus : 0
  const floor = groupsSolved <= points.floorAtOrBelow ? points.floorPenalty : 0

  return {
    accrual,
    mistakeCost,
    bonus,
    floor,
    net: accrual + mistakeCost + bonus + floor,
    potential: accrual + bonus,
    perfect,
  }
}

/**
 * Deterministic PRNG (mulberry32), so `shuffleBoardTiles` never reaches for
 * Math.random and a shuffle seed logged on board_served actually reproduces
 * the layout the student saw. Seed is a plain 32-bit unsigned int — the
 * caller derives it from the item/board id (see CLAUDE.md: seeds derive from
 * an id, never from array position), not from anything time-based.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Shuffle a board's tiles for serving order, reproducibly from `seed`.
 *  Reuses the project's one Fisher-Yates (lib/games/item-select.ts) with a
 *  seeded RNG in place of its Math.random default — never calls Math.random
 *  itself. Same seed -> same order, always; different seed -> (almost
 *  certainly) a different order. */
export function shuffleBoardTiles<T>(items: readonly T[], seed: number): T[] {
  return shuffle(items, mulberry32(seed))
}
