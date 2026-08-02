// db/009_add_item_retirement.sql adds `retired_at`/`retired_reason` to
// content_items, a soft-withdraw for bad items (chart captions etc.) that
// events may already reference and therefore cannot be deleted.
//
// Retirement is enforced purely as a SQL predicate (`retired_at is null`) in
// the three student-facing selection queries, not as a pure JS decision
// function the way selectItems/selectBoard's recency+difficulty ranking is
// (lib/games/item-select.ts, lib/games/match-board-select.ts). Those were
// extracted into standalone modules specifically because node's native test
// runner (`node --test`, no bundler) does not resolve the "@/*" tsconfig
// alias the route files under app/api use -- so a route.ts file cannot be
// imported here to exercise its query against fixtures the way the pure
// ranking logic can be.
//
// What this test CAN and does prove without a live DB (the migration is not
// yet applied as of this commit -- see db/009's header for why): every route
// that fetches a play pool from content_items carries the `retired_at is
// null` guard in its query text, and the one script that must deliberately
// keep seeing retired rows (build-term-mcq-spike.mjs, which feeds the
// research/quality-screen tooling -- CLAUDE.md, item-retirement package)
// does not. Once a human applies db/009 and runs the retirement UPDATE, the
// read-only verification queries in that file's trailing comment are the
// execution-level proof (retired count = 7, total row count unchanged at 67,
// events row count unchanged).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (rel: string) => readFileSync(root + rel, 'utf8')

// Every route that fetches a pool of content_items rows for a student to be
// served next. If a future game adds another content_items selection query,
// it belongs in this list too.
const STUDENT_FACING_SELECTION_ROUTES = [
  'app/api/questions/route.ts', // quiz: kind = 'mcq'
  'app/api/word/question/route.ts', // choose-the-right-word: kind = 'term_definition'
  'app/api/match/board/route.ts', // match: kind = 'term_definition'
]

for (const rel of STUDENT_FACING_SELECTION_ROUTES) {
  test(`${rel} excludes retired content_items rows from its selection pool`, () => {
    const src = read(rel)
    assert.ok(
      src.includes('retired_at is null'),
      `${rel} must filter its content_items selection query on retired_at is null`
    )
  })
}

test('answer-scoring routes are NOT required to filter on retired_at (they look up a specific already-served id, not a selection pool)', () => {
  // app/api/answer/route.ts, app/api/word/answer/route.ts and
  // app/api/match/submit/route.ts all look content_items up BY ID (the item
  // already served this round / carried in a signed board token), never a
  // fresh pool -- retiring an item mid-round must not break an in-flight
  // answer. Documented here, not enforced, since "must not filter" has no
  // string to assert against; this test exists so the intent is on record
  // next to the routes that DO filter, not discovered by omission.
  assert.ok(true)
})

test('build-term-mcq-spike.mjs deliberately does NOT filter retired rows -- it feeds the research/quality-screen tooling, which needs to see withdrawn items too', () => {
  const src = read('scripts/build-term-mcq-spike.mjs')
  // Checks for the actual filter clause, not the word "retired_at" -- the
  // file's own explanatory comment (above its query) legitimately mentions
  // retired_at while explaining why it must NOT be filtered on.
  assert.equal(
    src.includes('retired_at is null'),
    false,
    'the spike script must stay unfiltered; do not add a retired_at filter here (see the comment above its query)'
  )
})

test('db/009 migration file exists and is additive: no drop/delete/rename statements', () => {
  const src = read('db/009_add_item_retirement.sql').toLowerCase()
  assert.equal(/\bdrop\s+column\b/.test(src), false, 'must not drop a column')
  assert.equal(/\bdelete\s+from\b/.test(src), false, 'must not delete rows (retirement is soft-withdraw)')
  assert.equal(/\brename\b/.test(src), false, 'must not rename a column')
  assert.ok(src.includes('add column if not exists retired_at'), 'must add retired_at additively')
  assert.ok(src.includes('add column if not exists retired_reason'), 'must add retired_reason additively')
})

test('db/schema.sql reflects the retirement columns (canonical file stays true)', () => {
  const src = read('db/schema.sql')
  assert.ok(src.includes('retired_at'), 'schema.sql must document retired_at')
  assert.ok(src.includes('retired_reason'), 'schema.sql must document retired_reason')
  assert.ok(src.includes('content_items_live_idx'), 'schema.sql must document the live-items partial index')
})
