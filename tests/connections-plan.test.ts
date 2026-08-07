// scripts/author-connections-boards.mjs's no-I/O planning helpers, split into
// scripts/lib/connections-plan.mjs so db/011's authoring-time-only invariants (exactly 4 members
// per group, exactly 4 groups per board, no tile in two groups of one board) are testable without
// a live Neon connection -- same pattern as tests/term-import-plan.test.ts.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeBoardId,
  computeGroupId,
  validateCuratedBoardShape,
  planGroups,
} from '../scripts/lib/connections-plan.mjs'

const goodBoard = {
  id: 'b1-data-ai',
  groups: [
    { label: 'Dimensions of big data', members: ['Volume', 'Velocity', 'Variety', 'Veracity'] },
    { label: 'Types of data analytics', members: ['Descriptive', 'Diagnostic', 'Predictive', 'Prescriptive'] },
    { label: 'Major types of AI', members: ['Expert Systems', 'Genetic Algorithms', 'Computer Vision', 'Natural Language Processing'] },
    { label: 'Characteristics of blockchain', members: ['Decentralization', 'Immutability', 'Tokenization', 'Distributed Ledger'] },
  ],
}

test('computeBoardId is deterministic and sensitive to subject and slug', () => {
  const a = computeBoardId('Digital Transformation', 'b1-data-ai')
  const b = computeBoardId('Digital Transformation', 'b1-data-ai')
  assert.equal(a, b)
  assert.equal(a.length, 32)
  assert.match(a, /^[0-9a-f]{32}$/)
  assert.notEqual(a, computeBoardId('International Management', 'b1-data-ai'))
  assert.notEqual(a, computeBoardId('Digital Transformation', 'b2-change-process'))
})

test('computeGroupId is scoped to its board -- the same label on two different boards must not collide', () => {
  const g1 = computeGroupId('Digital Transformation', 'b1-data-ai', 'Stages of a process')
  const g2 = computeGroupId('Digital Transformation', 'b2-change-process', 'Stages of a process')
  assert.notEqual(g1, g2)
})

test('validateCuratedBoardShape passes a well-formed board (no problems)', () => {
  assert.deepEqual(validateCuratedBoardShape(goodBoard), [])
})

test('validateCuratedBoardShape rejects a board with the wrong number of groups', () => {
  const bad = { ...goodBoard, groups: goodBoard.groups.slice(0, 3) }
  const problems = validateCuratedBoardShape(bad)
  assert.ok(problems.some((p) => /has 3 group\(s\), expected exactly 4/.test(p)))
})

test('validateCuratedBoardShape rejects a group with the wrong number of members', () => {
  const bad = {
    ...goodBoard,
    groups: [
      { ...goodBoard.groups[0], members: ['Volume', 'Velocity', 'Variety'] },
      ...goodBoard.groups.slice(1),
    ],
  }
  const problems = validateCuratedBoardShape(bad)
  assert.ok(problems.some((p) => /has 3 member\(s\), expected exactly 4/.test(p)))
})

test('validateCuratedBoardShape rejects a tile that appears in two groups of the same board', () => {
  const bad = {
    ...goodBoard,
    groups: [
      goodBoard.groups[0],
      { ...goodBoard.groups[1], members: ['Volume', 'Diagnostic', 'Predictive', 'Prescriptive'] }, // "Volume" stolen from group 0
      goodBoard.groups[2],
      goodBoard.groups[3],
    ],
  }
  const problems = validateCuratedBoardShape(bad)
  assert.ok(problems.some((p) => /tile "Volume" appears in both/.test(p)))
})

test('validateCuratedBoardShape is case- and whitespace-insensitive for the cross-group collision check', () => {
  const bad = {
    ...goodBoard,
    groups: [
      goodBoard.groups[0],
      { ...goodBoard.groups[1], members: [' volume ', 'Diagnostic', 'Predictive', 'Prescriptive'] },
      goodBoard.groups[2],
      goodBoard.groups[3],
    ],
  }
  const problems = validateCuratedBoardShape(bad)
  assert.ok(problems.some((p) => /tile "volume" appears in both/.test(p)))
})

test('validateCuratedBoardShape rejects a duplicate member within one group', () => {
  const bad = {
    ...goodBoard,
    groups: [
      { ...goodBoard.groups[0], members: ['Volume', 'Volume', 'Variety', 'Veracity'] },
      ...goodBoard.groups.slice(1),
    ],
  }
  const problems = validateCuratedBoardShape(bad)
  assert.ok(problems.some((p) => /member "Volume" is duplicated within its own group/.test(p)))
})

test('validateCuratedBoardShape rejects a duplicate group label on one board', () => {
  const bad = { ...goodBoard, groups: [goodBoard.groups[0], goodBoard.groups[0], goodBoard.groups[2], goodBoard.groups[3]] }
  const problems = validateCuratedBoardShape(bad)
  assert.ok(problems.some((p) => /group label .* is duplicated/.test(p)))
})

test('validateCuratedBoardShape reports every problem in one pass, not just the first', () => {
  const bad = {
    id: 'bad',
    groups: [
      { label: 'A', members: ['x', 'x', 'y'] }, // wrong count + internal dup
      { label: 'B', members: ['p', 'q', 'r', 's'] },
    ],
  }
  const problems = validateCuratedBoardShape(bad)
  assert.ok(problems.length >= 3) // 4-groups check, 3-members check, internal dup
})

test('planGroups flattens a board in authored order and tags deterministic group ids', () => {
  const planned = planGroups('Digital Transformation', goodBoard)
  assert.equal(planned.length, 4)
  assert.equal(planned[0].label, 'Dimensions of big data')
  assert.equal(planned[0].ordinal, 0)
  assert.deepEqual(planned[0].members, ['Volume', 'Velocity', 'Variety', 'Veracity'])
  assert.equal(planned[0].groupId, computeGroupId('Digital Transformation', 'b1-data-ai', 'Dimensions of big data'))
  assert.equal(planned[3].ordinal, 3)
})
