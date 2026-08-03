// Pure planning helpers for scripts/import-terms.mjs, split out so the two parts with no I/O --
// the human-exclusion list and the live-minus-imported retirement diff -- are unit-testable
// without a database or CLI, same pattern as term-dedup.mjs and terms-validate.mjs.

import { createHash } from 'node:crypto'

// content_items id formula, exactly as generate-terms.mjs (~line 408) and
// build-term-mcq-spike.mjs's --from-json path (~line 151) both compute it:
// sha256(subject::term), first 32 hex chars. Any drift here mints an id that matches nothing
// already in the database, or fails to collide with a row it should update in place.
export function computeTermId(subject, term) {
  return createHash('sha256').update(`${subject}::${term}`).digest('hex').slice(0, 32)
}

// Human judgement, not a validator verdict -- same distinction db/010 draws for its 'trivia'
// reason. These three pass terms-validate.mjs and the automated gap screen and are still chart
// captions / slide headings lifted verbatim off a CAGE-deck exhibit, not concepts that stand on
// their own; caught by eye, not by any rule general enough to codify (see db/010's 'trivia'
// comment for the same shape of problem). Scoped to the subject they were drafted in --
// content_items is subject-scoped -- and matched by EXACT term string, never a normalised key: a
// fuzzy match here risks excluding a genuinely different item that merely resembles one of these.
export const HUMAN_EXCLUSIONS_BY_SUBJECT = {
  'International Management': [
    'Android Sessions by Game Category',
    'Globalization Case Study',
    'Other Dimensions of Distance',
  ],
}

/** Removes every item whose `term` exactly matches an entry in this subject's human-exclusion
 *  list. Fails LOUD, not silent: if the subject has an exclusion list and one of its entries is
 *  not present in `items`, that is exactly the "silent miss ships a caption" failure the brief
 *  warns about, so this throws rather than returning a partial result. Returns the excluded items
 *  too, so the caller can report what was pulled and why. */
export function applyHumanExclusions(items, subject) {
  const toExclude = HUMAN_EXCLUSIONS_BY_SUBJECT[subject] ?? []
  const excluded = []
  let kept = items
  for (const term of toExclude) {
    const hit = kept.find((it) => it.term === term)
    if (!hit) {
      throw new Error(
        `Human exclusion "${term}" (subject "${subject}") was not found in the cohort being ` +
        `imported -- refusing to proceed silently.`
      )
    }
    excluded.push(hit)
    kept = kept.filter((it) => it !== hit)
  }
  return { kept, excluded }
}

/** Explicit id-list set difference: every id in `liveIds` that is NOT in `importedIds`. This is
 *  the retirement list -- built from a computed difference, never a broad predicate (a subject
 *  match alone would also catch rows this very import just wrote). */
export function retirementDiff(liveIds, importedIds) {
  const imported = new Set(importedIds)
  return liveIds.filter((id) => !imported.has(id))
}
