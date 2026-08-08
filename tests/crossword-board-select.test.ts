// Package A6 (Task C): pure board-selection logic for crossword
// (app/api/crossword/board/route.ts via lib/games/crossword-board-select.ts).
// Mirrors tests/connections-board-select.test.ts's coverage shape -- same
// underlying selectItems() primitive, same "least-recently-served, never
// hard exclusion, no difficulty tiebreak" behaviour.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectCrosswordBoard, type EligibleCrosswordBoard } from '../lib/games/crossword-board-select.ts'

function boardsFor(subject: string, n: number): EligibleCrosswordBoard[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${subject}-${i}`, subject, difficulty: null }))
}

test('a single live board is still served (no lockout, unlike a hard-exclusion design)', () => {
  const boards = boardsFor('DT', 1)
  const selection = selectCrosswordBoard(boards, new Map())
  assert.ok(selection)
  assert.equal(selection!.boardId, 'DT-0')
  assert.equal(selection!.subject, 'DT')
})

test('no boards at all: returns null (caller returns 409)', () => {
  assert.equal(selectCrosswordBoard([], new Map()), null)
})

test('LRS: never-served boards are always preferred over previously served ones', () => {
  const boards = boardsFor('DT', 3)
  const lastServed = new Map([
    ['DT-0', 1_000],
    ['DT-1', 2_000],
  ])
  // DT-2 has never been served; it must win regardless of the "random" subject pick.
  const selection = selectCrosswordBoard(boards, lastServed, () => 0)
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
  const selection = selectCrosswordBoard(boards, lastServed, () => 0)
  assert.ok(selection)
  assert.equal(selection!.boardId, 'DT-1')
})

test('a fully-saturated student (every board already served) still gets a board, never a lockout', () => {
  const boards = boardsFor('DT', 2)
  const lastServed = new Map([
    ['DT-0', 5_000],
    ['DT-1', 1_000],
  ])
  const selection = selectCrosswordBoard(boards, lastServed, () => 0)
  assert.ok(selection, 'a saturated student must still receive a playable board')
  assert.equal(selection!.boardId, 'DT-1', 'the least-recently-served of the two must still be chosen')
})

test('boards from multiple subjects: the chosen board always belongs to the chosen subject', () => {
  const boards = [...boardsFor('IM', 2), ...boardsFor('DT', 2)]
  for (let i = 0; i < 5; i++) {
    const selection = selectCrosswordBoard(boards, new Map(), () => i / 5)
    assert.ok(selection)
    assert.ok(selection!.boardId.startsWith(selection!.subject))
  }
})
