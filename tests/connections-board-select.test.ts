// Package A5: pure board-selection logic for Connections
// (app/api/connections/board/route.ts via lib/games/connections-board-select.ts).
// Mirrors tests/match-board.test.ts's coverage shape for the same reasoning
// this file's own header gives: least-recently-served ranking, never hard
// exclusion, no difficulty tiebreak in this build.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectConnectionsBoard, type EligibleConnectionsBoard } from '../lib/games/connections-board-select.ts'

function boardsFor(subject: string, n: number): EligibleConnectionsBoard[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${subject}-${i}`, subject, difficulty: null }))
}

test('a single live board is still served (no lockout, unlike a hard-exclusion design)', () => {
  const boards = boardsFor('DT', 1)
  const selection = selectConnectionsBoard(boards, new Map(), null)
  assert.ok(selection)
  assert.equal(selection!.boardId, 'DT-0')
  assert.equal(selection!.subject, 'DT')
})

test('no boards at all: returns null (caller returns 409)', () => {
  assert.equal(selectConnectionsBoard([], new Map(), null), null)
})

test('LRS: never-served boards are always preferred over previously served ones', () => {
  const boards = boardsFor('DT', 3)
  const lastServed = new Map([
    ['DT-0', 1_000],
    ['DT-1', 2_000],
  ])
  // DT-2 has never been served; it must win regardless of the "random" subject pick.
  const selection = selectConnectionsBoard(boards, lastServed, null, () => 0)
  assert.ok(selection)
  assert.equal(selection!.boardId, 'DT-2')
})

test('LRS: among served boards, the oldest-served is preferred', () => {
  const boards = boardsFor('DT', 3)
  const lastServed = new Map([
    ['DT-0', 3_000],
    ['DT-1', 1_000],
    ['DT-2', 2_000],
  ])
  const selection = selectConnectionsBoard(boards, lastServed, null, () => 0)
  assert.ok(selection)
  assert.equal(selection!.boardId, 'DT-1')
})

test('a fully-saturated student (every board already served) still gets a board, never a lockout', () => {
  const boards = boardsFor('DT', 2)
  const lastServed = new Map([
    ['DT-0', 5_000],
    ['DT-1', 1_000],
  ])
  const selection = selectConnectionsBoard(boards, lastServed, null, () => 0)
  assert.ok(selection, 'a saturated student must still receive a playable board')
  assert.equal(selection!.boardId, 'DT-1', 'the least-recently-served of the two must still be chosen')
})

test('boards from multiple subjects: the chosen board always belongs to the chosen subject', () => {
  const boards = [...boardsFor('IM', 2), ...boardsFor('DT', 2)]
  for (let i = 0; i < 5; i++) {
    const selection = selectConnectionsBoard(boards, new Map(), null, () => i / 5)
    assert.ok(selection)
    assert.ok(selection!.boardId.startsWith(selection!.subject))
  }
})

test('targetDifficulty is always null in this build -- no board has a difficulty value, and none is honoured even if passed', () => {
  // Same shape as match-board.test.ts's FIX 7 coverage: with difficulty null
  // on every candidate, selection falls back to recency alone regardless of
  // what targetDifficulty the caller passes -- selectItems' own guard, not
  // anything special to this wrapper. Exercised here to pin that this
  // wrapper never claims otherwise.
  const boards = boardsFor('DT', 3)
  const selection = selectConnectionsBoard(boards, new Map(), 3, () => 0)
  assert.ok(selection)
  assert.equal(selection!.boardId, 'DT-0', 'recency (all never-served) decides, not a difficulty target')
})
