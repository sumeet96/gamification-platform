// scripts/lib/join-run-to-items.mjs recovers item identity for a spike-simulate-difficulty.mjs run
// file, whose rows carry only an array index (`{i, p, prompt}`), never an item id. This is the join
// scripts/calibrate-difficulty.mjs's --from path and scripts/analyse-item-gap.mjs both depend on --
// a silent mis-join would apply one item's simulated_p/difficulty to a different item, so each guard
// gets its own test rather than relying on eyeballing a --dry-run.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { joinRunToItems } from '../scripts/lib/join-run-to-items.mjs'

const items = [
  { id: 'a1', prompt: 'What is A?', term: 'A' },
  { id: 'a2', prompt: 'What is B?', term: 'B' },
  { id: 'a3', prompt: 'What is C?', term: 'C' },
]
const rows = [
  { i: 0, p: 0.9, prompt: 'What is A?' },
  { i: 1, p: 0.5, prompt: 'What is B?' },
  { i: 2, p: 0.1, prompt: 'What is C?' },
]

test('happy path: joins row i to items[i], carrying id/p/prompt/label through', () => {
  const joined = joinRunToItems(rows, items)
  assert.equal(joined.length, 3)
  assert.deepEqual(joined.map((r) => r.id), ['a1', 'a2', 'a3'])
  assert.deepEqual(joined.map((r) => r.p), [0.9, 0.5, 0.1])
  assert.deepEqual(joined.map((r) => r.label), ['A', 'B', 'C'])
  assert.deepEqual(joined.map((r) => r.prompt), ['What is A?', 'What is B?', 'What is C?'])
  assert.equal(joined[0].item, items[0])
})

test('falls back to topic label when items have no term field, then to the row-level topic', () => {
  const topicItems = [{ id: 'x1', prompt: 'P1', topic: 'Topic 1' }]
  const topicRows = [{ i: 0, p: 0.4, prompt: 'P1' }]
  const joined = joinRunToItems(topicRows, topicItems)
  assert.equal(joined[0].label, 'Topic 1')

  const bareItems = [{ id: 'x2', prompt: 'P2' }]
  const bareRows = [{ i: 0, p: 0.4, prompt: 'P2', topic: 'Row Topic' }]
  const joined2 = joinRunToItems(bareRows, bareItems)
  assert.equal(joined2[0].label, 'Row Topic')
})

test('guard: length mismatch between rows and items is rejected', () => {
  assert.throws(
    () => joinRunToItems(rows.slice(0, 2), items),
    /has 2 row\(s\) but .* has 3 item\(s\)/,
  )
})

test('guard: a row whose recorded index does not match its position is rejected', () => {
  const badRows = [rows[0], { ...rows[1], i: 5 }, rows[2]]
  assert.throws(
    () => joinRunToItems(badRows, items),
    /row 1 has i=5, not 1/,
  )
})

test('guard: a prompt mismatch between the run file and the items file is rejected', () => {
  const badRows = [rows[0], { ...rows[1], prompt: 'A different question entirely' }, rows[2]]
  assert.throws(
    () => joinRunToItems(badRows, items),
    /row 1's prompt does not match/,
  )
})

test('guard: duplicate ids in the items file make the index-to-id join ambiguous', () => {
  const dupItems = [items[0], { ...items[1], id: 'a1' }, items[2]]
  assert.throws(
    () => joinRunToItems(rows, dupItems),
    /duplicate id\(s\).*a1/,
  )
})

test('error messages use the caller-supplied file labels, not a generic placeholder', () => {
  assert.throws(
    () => joinRunToItems(rows.slice(0, 2), items, { runLabel: 'run.json', itemsLabel: 'items.json' }),
    /run\.json has 2 row\(s\) but items\.json has 3 item\(s\)/,
  )
})
