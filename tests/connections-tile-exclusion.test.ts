// Package A5, loosened-clue-bar follow-up (7 Aug 2026): scripts/mint-connections-tiles.mjs's
// --clue-bar=provenance mode mints term_definition rows whose clue proves the deck teaches the
// term but does NOT distinguish it from its group-mates -- safe for Connections (the clue is never
// rendered during play, only the group label is) but unsafe for any game that DOES render the clue
// as the prompt. Every row minted this way is tagged `recipe = 'connections-tile-v1'`
// (scripts/author-connections-boards.mjs's --mint-file insert path), and this guard is what makes
// the loosened bar safe -- see mint-connections-tiles.mjs's header for the full reasoning.
//
// Same testing constraint as tests/item-retirement.test.ts: node's native test runner doesn't
// resolve the "@/*" tsconfig alias the route files under app/api use, so a route.ts file cannot be
// imported here to exercise its query against fixtures. What this test CAN and does prove without a
// live DB: every route that renders a term_definition clue as the prompt carries the
// `recipe is distinct from 'connections-tile-v1'` guard in its selection query text, and the quiz
// (which never reads term_definition rows at all) needs no such guard.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (rel: string) => readFileSync(root + rel, 'utf8')

const RECIPE_GUARD = "recipe is distinct from 'connections-tile-v1'"

// Every route that fetches a pool of term_definition rows and renders the clue as the student-
// facing prompt (choose-the-right-word's clue, match's left-hand column). If a future game adds
// another term_definition selection query that renders the clue, it belongs in this list too.
const CLUE_RENDERING_SELECTION_ROUTES = [
  'app/api/word/question/route.ts', // choose-the-right-word: clue is the prompt
  'app/api/match/board/route.ts', // match: clue is the left-hand column
]

for (const rel of CLUE_RENDERING_SELECTION_ROUTES) {
  test(`${rel} excludes recipe='connections-tile-v1' rows from its selection pool`, () => {
    const src = read(rel)
    assert.ok(
      src.includes(RECIPE_GUARD),
      `${rel} must filter its content_items selection query on ${RECIPE_GUARD}`
    )
  })
}

test('the quiz does not need the recipe guard -- it only ever reads kind=\'mcq\' rows, never term_definition', () => {
  const src = read('app/api/questions/route.ts')
  assert.ok(src.includes("kind = 'mcq'"), 'quiz selection must scope to kind=\'mcq\'')
  assert.equal(
    src.includes(RECIPE_GUARD),
    false,
    'the quiz route should not need the connections-tile-v1 guard -- it is scoped away from term_definition rows already; ' +
      'if this starts failing, the quiz query widened its kind scope and needs the guard added, not this test loosened'
  )
})

test('scripts/author-connections-boards.mjs tags every minted row with recipe connections-tile-v1', () => {
  const src = read('scripts/author-connections-boards.mjs')
  assert.ok(
    src.includes("recipe: 'connections-tile-v1'"),
    'the --mint-file insert path must tag every upserted row so selection routes can exclude it'
  )
  assert.ok(
    src.includes('recipe = excluded.recipe'),
    'the upsert must also update recipe on conflict, or a re-run could silently drop the tag'
  )
})

test('scripts/mint-connections-tiles.mjs records which clue bar produced each candidate', () => {
  const src = read('scripts/mint-connections-tiles.mjs')
  assert.ok(src.includes("clue_bar"), 'candidates must be tagged with the bar (strict/provenance) used to mint them')
  assert.ok(src.includes('--clue-bar'), 'the loosened bar must be an explicit opt-in flag, not a silent default change')
})
