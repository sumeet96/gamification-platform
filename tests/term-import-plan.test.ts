// scripts/import-terms.mjs (package: import the gen3 screened cohort, retire what it supersedes)
// splits its two no-I/O decisions -- the human-exclusion list and the live-minus-imported
// retirement diff -- into scripts/lib/term-import-plan.mjs specifically so they are testable
// without a database or CLI, same pattern as term-dedup.mjs / terms-validate.mjs.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeTermId,
  applyHumanExclusions,
  retirementDiff,
  HUMAN_EXCLUSIONS_BY_SUBJECT,
} from '../scripts/lib/term-import-plan.mjs'

test('computeTermId matches generate-terms.mjs / build-term-mcq-spike.mjs\'s formula (sha256(subject::term), 32 hex chars)', () => {
  const id = computeTermId('Digital Transformation', 'Extreme Programming')
  assert.equal(id, '1e041b4c6c5df8647785e5aa7b8dedfb') // verified against the live row on Neon
  assert.equal(id.length, 32)
  assert.match(id, /^[0-9a-f]{32}$/)
})

test('computeTermId is sensitive to subject -- a wrong subject mints a different id', () => {
  const a = computeTermId('Digital Transformation', 'Inception')
  const b = computeTermId('International Management', 'Inception')
  assert.notEqual(a, b)
})

test('the three exclusion terms are present, exactly as specced, under International Management', () => {
  const list = HUMAN_EXCLUSIONS_BY_SUBJECT['International Management']
  assert.deepEqual(list, [
    'Android Sessions by Game Category',
    'Globalization Case Study',
    'Other Dimensions of Distance',
  ])
})

test('applyHumanExclusions removes exactly the configured terms for a subject that has them', () => {
  const items = [
    { term: 'Cultural Adaptation' },
    { term: 'Android Sessions by Game Category' },
    { term: 'Globalization Case Study' },
    { term: 'Other Dimensions of Distance' },
    { term: 'Gravity Model of Trade Flow' },
  ]
  const { kept, excluded } = applyHumanExclusions(items, 'International Management')
  assert.deepEqual(kept.map((i: { term: string }) => i.term), ['Cultural Adaptation', 'Gravity Model of Trade Flow'])
  assert.equal(excluded.length, 3)
})

test('applyHumanExclusions is a no-op for a subject with no configured exclusions', () => {
  const items = [{ term: 'Agile software development' }, { term: 'Inception' }]
  const { kept, excluded } = applyHumanExclusions(items, 'Digital Transformation')
  assert.equal(kept.length, 2)
  assert.equal(excluded.length, 0)
})

test('applyHumanExclusions throws loudly, not silently, when a configured exclusion is missing from the cohort', () => {
  // Only 2 of the 3 required IM exclusions present -- "Globalization Case Study" is missing.
  const items = [
    { term: 'Android Sessions by Game Category' },
    { term: 'Other Dimensions of Distance' },
  ]
  assert.throws(
    () => applyHumanExclusions(items, 'International Management'),
    /Globalization Case Study[\s\S]*not found/
  )
})

test('applyHumanExclusions matches by EXACT term string, not a case- or whitespace-insensitive one', () => {
  const items = [{ term: 'android sessions by game category' }] // lowercased -- not an exact match
  assert.throws(() => applyHumanExclusions(items, 'International Management'))
})

test('retirementDiff is the set of live ids not present in the imported set', () => {
  const live = ['a', 'b', 'c', 'd']
  const imported = ['b', 'd', 'e'] // 'e' is a live id from another subject's data leaking in -- must not matter
  assert.deepEqual(retirementDiff(live, imported), ['a', 'c'])
})

test('retirementDiff retires nothing when every live id is re-imported', () => {
  assert.deepEqual(retirementDiff(['a', 'b'], ['a', 'b', 'c']), [])
})

test('retirementDiff retires everything when nothing overlaps', () => {
  assert.deepEqual(retirementDiff(['a', 'b'], ['c', 'd']), ['a', 'b'])
})

test('retirementDiff preserves live-list order (matches the human-readable "before/after" report)', () => {
  assert.deepEqual(retirementDiff(['z', 'a', 'm'], ['a']), ['z', 'm'])
})
