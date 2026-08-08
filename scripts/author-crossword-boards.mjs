#!/usr/bin/env node
// Package A6 board-authoring path -- turns scripts/spike-crossword-density.mjs's measurement-only
// placer into a real writer for crossword_boards / crossword_entries (db/013_add_crossword.sql).
// This is the ONLY place that writes those two tables; the game runtime (the not-yet-built
// app/api/crossword/* routes) only ever reads them. Modeled on scripts/author-connections-boards.mjs
// (the --dry-run/--commit split, sql.transaction([...]) for real atomicity over Neon's HTTP driver,
// post-write verification that flags rather than rolls back) and scripts/mint-connections-tiles.mjs
// (the "screen before write, never after" clue-minting JSON pattern, status "ok" | "needs_review").
//
// Board unit is one `source_id` (a real deck), not a subject -- confirmed this session as the real
// board grain (9-33 terms/deck measured live against the bank). Placement reuses
// scripts/lib/crossword-plan.mjs's canPlace/tryPlaceWord/runOnce/placeBest verbatim (see that file's
// header for why the algorithm lives there rather than being copy-pasted here or imported from the
// spike script directly) -- this script only DECORATES the placer's output: attributing placed
// fragments back to content_items rows, flagging collisions and same-term duplicates, minting clues,
// and persisting the result. scripts/spike-crossword-density.mjs itself is untouched by this work.
//
// --- Two decorating steps this script adds that the measurement-only spike never needed, both
// discovered against the REAL target deck (source_id 1e023f0245ff97a2f72c0ce5) while writing this
// script, not merely theorised -- 19 of its 33 terms produce more than one fragment in [3,10] chars
// (e.g. "Big data" -> BIG, DATA; "Sentiment Analysis Cleaning" -> SENTIMENT, ANALYSIS, CLEANING) ---
//
//   1. FRAGMENT COLLISION (the one the plan names explicitly): the SAME fragment string is produced
//      by more than one DIFFERENT term (e.g. "DIAGNOSTIC" claimed by both "Diagnostic Analytics" and
//      "Diagnostic"). Per the user's explicit 7 Aug decision, this is FULLY human-reviewed -- emitted
//      as a `needs_review` collision listing every claimant term, with NO suggested winner. No
//      algorithmic tie-break, ever.
//   2. TERM-ALREADY-HAS-AN-ENTRY (a schema-driven constraint this script had to discover, not named
//      in the plan): crossword_entries has `unique (board_id, content_item_id)` -- a term may supply
//      AT MOST ONE entry per board. Feeding the placer every fragment of every term (not just one per
//      term) is deliberate -- it reproduces the exact candidate universe scripts/spike-crossword-
//      density.mjs already measured 43.5% density / 28-of-30-placed against on this exact deck, and
//      restricting to one fragment per term BEFORE placement would silently regress that measured
//      result. So the constraint is enforced AFTER placement instead: entries are attributed in the
//      placer's own placement order, and if a term's fragment gets placed a second time after that
//      term already has an entry, the SECOND placement is excluded (reason
//      'term-already-has-an-entry'), not written, and reported -- never silently dropped, per the
//      "orphaned/excluded fragments always get a reason" requirement.
//
// --dry-run is the default (same convention as import-terms.mjs / author-connections-boards.mjs): it
// resolves everything, mints clues for every collision-free entry, prints/writes the full reviewable
// plan, and writes nothing to the database. --commit is the only way to write, and refuses the whole
// run (exit non-zero, nothing written) if any collision remains unresolved or any entry's clue is
// still `needs_review` -- validate everything, then write, or write nothing.
//
// Usage:
//   node scripts/author-crossword-boards.mjs --source-id 1e023f0245ff97a2f72c0ce5 [--dry-run]
//   node scripts/author-crossword-boards.mjs --source-id 1e023f0245ff97a2f72c0ce5 \
//     --review-file spike-data/crossword-board-1e023f0245ff97a2f72c0ce5.json --commit
//   node scripts/author-crossword-boards.mjs --source-id <id> --out <path> [--provider openai]
//     [--model gpt-4.1-mini] [--restarts 100] [--min-len 3] [--max-len 10]

import { readFileSync, writeFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { loadEnv, createClient } from './lib/llm-client.mjs'
import { fragmentsOf, placeBest, computeBoardId } from './lib/crossword-plan.mjs'
import { checkClueLeak, checkChartTitle, checkSourceLeak, checkProvenance } from './lib/terms-validate.mjs'

loadEnv()

const USAGE =
  'Usage: node scripts/author-crossword-boards.mjs --source-id <id> [--dry-run|--commit] ' +
  '[--out f.json] [--review-file f.json] [--provider openai] [--model M] [--restarts 100] ' +
  '[--min-len 3] [--max-len 10]'
const die = (msg) => { console.error(`${msg}\n${USAGE}`); process.exit(1) }
const flag = (name, fallback = null) => {
  const i = process.argv.indexOf(name)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  if (!v || v.startsWith('--')) die(`${name} needs a value.`)
  return v
}

const sourceId = flag('--source-id')
if (!sourceId) die('--source-id is required (a real content_items.source_id -- the board unit).')
const COMMIT = process.argv.includes('--commit')
const DRY_RUN_FLAG = process.argv.includes('--dry-run')
if (COMMIT && DRY_RUN_FLAG) die('--dry-run and --commit are mutually exclusive.')
const DRY_RUN = !COMMIT // dry-run is the default; --commit is the only way to write

const outPath = flag('--out', `spike-data/crossword-board-${sourceId}.json`)
const reviewFilePath = flag('--review-file')
const provider = flag('--provider', 'openai')
const modelFlag = flag('--model')
const restarts = Number(flag('--restarts', 100))
const minLen = Number(flag('--min-len', 3))
const maxLen = Number(flag('--max-len', 10))

const DB = process.env.DATABASE_URL
if (!DB) die('Missing DATABASE_URL.')
const sql = neon(DB)

console.log(`Authoring a crossword board for source_id "${sourceId}"${DRY_RUN ? ' (dry run)' : ' (COMMIT)'}...\n`)

// --- 1. load live term_definition rows for this source_id (read-only) ---
const rows = await sql`
  select id, term, clue, page, subject
  from content_items
  where kind = 'term_definition' and retired_at is null and source_id = ${sourceId}
  order by id
`
if (rows.length === 0) die(`No live term_definition rows for source_id "${sourceId}".`)
const subject = rows[0].subject
for (const r of rows) {
  if (r.subject !== subject) {
    die(`content_items rows for source_id "${sourceId}" span more than one subject ` +
      `("${subject}" and "${r.subject}") -- refusing to guess which one a crossword_boards row should carry.`)
  }
}
const rowsById = new Map(rows.map((r) => [r.id, r]))
console.log(`${rows.length} live term_definition row(s) for source_id "${sourceId}" (subject "${subject}").\n`)

// --- 2. extract fragments per term (SAME fragmentsOf() as the spike -- see crossword-plan.mjs) ---
const excluded = [] // { reason, ...detail } -- never a silent drop
const fragMap = new Map() // fragment string -> [{ contentItemId, term }]
const rowFragsById = new Map()
for (const r of rows) {
  const frags = fragmentsOf(r.term, minLen, maxLen)
  rowFragsById.set(r.id, frags)
  if (frags.length === 0) {
    excluded.push({
      contentItemId: r.id, term: r.term, fragment: null, reason: 'no-fragment-in-range',
      detail: `"${r.term}" produced no content word within [${minLen},${maxLen}] chars after stopword filtering.`,
    })
    continue
  }
  for (const f of frags) {
    if (!fragMap.has(f)) fragMap.set(f, [])
    fragMap.get(f).push({ contentItemId: r.id, term: r.term })
  }
}
const words = [...fragMap.keys()]
if (words.length < 2) die(`Only ${words.length} fragment(s) in range [${minLen},${maxLen}] -- nothing to place.`)
console.log(`${rows.length} term(s) -> ${words.length} unique fragment string(s) in [${minLen},${maxLen}] cells ` +
  `(${excluded.length} term(s) excluded for producing none).\n`)

// --- 3. run the placer (reused verbatim from crossword-plan.mjs, decorate its output below) ---
const best = placeBest(words, restarts, 42)
console.log(`Placer: best of ${restarts} restart(s) -- ${best.placed.length}/${words.length} fragment(s) placed, ` +
  `${best.orphaned.length} orphaned.\n`)

// Translate ONCE, here, to a clean 0-indexed frame -- the raw placer anchors its first word at (0,0)
// but can and does place later words at negative x/y (a new word is anchored relative to an existing
// letter and can extend either direction from it). Applied uniformly to every coordinate this script
// prints from this point on (both resolved entries AND collisions), so a human reviewing the --out
// JSON sees ONE consistent coordinate frame across both lists, and (equally important) so the
// (fragment,x,y,direction) key used to match a --review-file's collisions back to a later re-run's
// freshly recomputed collisions stays stable -- it would silently stop matching if entries and
// collisions were translated on two different schedules. best.w/best.h are translation-invariant
// (a size, not a position) and become the board's persisted width/height directly.
const minX = Math.min(...best.placed.map((p) => p.x))
const minY = Math.min(...best.placed.map((p) => p.y))
const width = best.w
const height = best.h

// --- 4. attribute each PLACED fragment to a content_items row, in the placer's own placement order.
//        Two decorating rules applied here (see file header): fragment collisions (>1 claimant term)
//        go to needs_review with no suggested winner; a term whose fragment gets placed a SECOND time
//        (after it already has an entry) is excluded, not silently double-written. ---
const assignedTermIds = new Set()
let resolvedEntries = [] // { contentItemId, term, fragment, x, y, direction }
let collisions = [] // { fragment, x, y, direction, claimants: [{contentItemId, term}], resolvedContentItemId }

for (const p of best.placed) {
  const x = p.x - minX, y = p.y - minY
  const claimants = fragMap.get(p.word)
  const uniqueClaimants = [...new Map(claimants.map((c) => [c.contentItemId, c])).values()]
  if (uniqueClaimants.length > 1) {
    collisions.push({ fragment: p.word, x, y, direction: p.dir, claimants: uniqueClaimants, resolvedContentItemId: null })
    continue
  }
  const only = uniqueClaimants[0]
  if (assignedTermIds.has(only.contentItemId)) {
    excluded.push({
      contentItemId: only.contentItemId, term: only.term, fragment: p.word, x, y, direction: p.dir,
      reason: 'term-already-has-an-entry',
      detail: `term "${only.term}" already supplies another placed entry on this board -- crossword_entries ` +
        `has unique(board_id, content_item_id), so a term can only ever fill one grid entry.`,
    })
    continue
  }
  assignedTermIds.add(only.contentItemId)
  resolvedEntries.push({ contentItemId: only.contentItemId, term: only.term, fragment: p.word, x, y, direction: p.dir })
}
for (const frag of best.orphaned) {
  const uniqueClaimants = [...new Map(fragMap.get(frag).map((c) => [c.contentItemId, c])).values()]
  excluded.push({
    contentItemId: null, term: null, fragment: frag, reason: 'placer-could-not-place',
    detail: 'greedy placer found no valid crossing for this fragment within the restart budget.',
    claimants: uniqueClaimants,
  })
}
console.log(`${resolvedEntries.length} entr(y/ies) resolved to a single term, ${collisions.length} fragment collision(s) ` +
  `needing human review, ${excluded.length} fragment(s)/term(s) excluded (see "excluded" in ${outPath}).\n`)

// --- 5. merge --review-file, if given: a human-edited copy of a PRIOR run's --out JSON. Resolves
//        collisions whose "resolvedContentItemId" the human filled in (must be one of that collision's
//        own claimants, and must not already be assigned to another entry), carries forward any entry
//        the human already approved (clueStatus "ok") so it is not silently re-minted, and -- ADDED
//        after the first human review round of the actual b1-data-ai test board found the need for it
//        -- lets the human mark a collision `"drop": true` instead of picking a winner, for a fragment
//        judged not worth adding a grid entry for at all (e.g. too tangential to the coursework to be
//        worth remembering). A dropped collision moves to `excluded` with a reason, same "never a
//        silent drop" posture as every other exclusion path in this script -- it is NOT the same as
//        leaving `resolvedContentItemId` blank, which stays needs_review and still blocks --commit. ---
let reviewedEntryByItemId = new Map()
if (reviewFilePath) {
  let review
  try {
    review = JSON.parse(readFileSync(reviewFilePath, 'utf8'))
  } catch (err) {
    die(`Could not read/parse --review-file ${reviewFilePath}: ${err.message}`)
  }
  if (review.sourceId !== sourceId) {
    die(`--review-file ${reviewFilePath} was authored for source_id "${review.sourceId}", not "${sourceId}" -- refusing to mix boards.`)
  }
  reviewedEntryByItemId = new Map((review.entries ?? []).map((e) => [e.contentItemId, e]))

  const reviewCollisionByKey = new Map(
    (review.collisions ?? []).map((c) => [`${c.fragment}|${c.x}|${c.y}|${c.direction}`, c])
  )
  const stillUnresolved = []
  let resolvedFromReviewCount = 0
  let droppedFromReviewCount = 0
  for (const c of collisions) {
    const k = `${c.fragment}|${c.x}|${c.y}|${c.direction}`
    const reviewed = reviewCollisionByKey.get(k)
    if (reviewed?.drop === true) {
      excluded.push({
        contentItemId: null, term: null, fragment: c.fragment, x: c.x, y: c.y, direction: c.direction,
        reason: 'removed-by-human-review',
        detail: `Collision among ${c.claimants.map((cl) => cl.term).join(', ')} -- a human chose to drop ` +
          `this fragment from the board via --review-file rather than assign it a winner.`,
        claimants: c.claimants,
      })
      droppedFromReviewCount++
      console.log(`  Collision "${c.fragment}" DROPPED per ${reviewFilePath} -- no entry will be placed for it.`)
      continue
    }
    const winnerId = reviewed?.resolvedContentItemId ?? null
    if (!winnerId) { stillUnresolved.push(c); continue }
    const winner = c.claimants.find((cl) => cl.contentItemId === winnerId)
    if (!winner) {
      console.error(`  Collision "${c.fragment}" @ (${c.x},${c.y}) ${c.direction}: resolvedContentItemId ` +
        `"${winnerId}" in ${reviewFilePath} is not one of this collision's claimants -- ignoring, still needs_review.`)
      stillUnresolved.push(c)
      continue
    }
    if (assignedTermIds.has(winnerId)) {
      console.error(`  Collision "${c.fragment}": chosen winner "${winner.term}" already supplies another ` +
        `entry on this board -- refusing this resolution, still needs_review.`)
      stillUnresolved.push(c)
      continue
    }
    assignedTermIds.add(winnerId)
    resolvedEntries.push({ contentItemId: winnerId, term: winner.term, fragment: c.fragment, x: c.x, y: c.y, direction: c.direction })
    resolvedFromReviewCount++
    console.log(`  Collision "${c.fragment}" resolved from ${reviewFilePath} -> "${winner.term}".`)
  }
  collisions = stillUnresolved
  console.log(`--review-file ${reviewFilePath}: ${resolvedFromReviewCount} collision(s) resolved, ` +
    `${droppedFromReviewCount} dropped, ${collisions.length} still unresolved.\n`)
}

// --- 5b. a human can also drop a SOLO resolved entry (not a collision -- e.g. one whose clue mint
//         keeps genuinely failing because the underlying content_items.clue is a known placeholder,
//         not because of a transient model hiccup) via the SAME --review-file's `entries` array,
//         `{ "contentItemId": "...", "drop": true }`. Mirrors the collision-drop mechanism above --
//         moves to `excluded` with a reason, never a silent removal, and happens BEFORE ordinal
//         assignment/clue-minting so a dropped entry costs no model call and never blocks --commit. ---
if (reviewFilePath) {
  const keep = []
  for (const e of resolvedEntries) {
    const reviewed = reviewedEntryByItemId.get(e.contentItemId)
    if (reviewed?.drop === true) {
      assignedTermIds.delete(e.contentItemId)
      excluded.push({
        contentItemId: e.contentItemId, term: e.term, fragment: e.fragment, x: e.x, y: e.y, direction: e.direction,
        reason: 'removed-by-human-review',
        detail: `A human dropped this resolved entry via --review-file (e.g. its clue mint kept failing ` +
          `against a genuinely thin/placeholder source definition, not a transient model error).`,
      })
      console.log(`  Entry "${e.fragment}" (${e.term}) DROPPED per ${reviewFilePath} -- no entry will be placed for it.`)
      continue
    }
    keep.push(e)
  }
  resolvedEntries = keep
}

// --- 6. assign stable ordinals -- reading order (top-to-bottom, left-to-right; 'H' before 'V' at a
//        shared start cell), not placement/restart order, so ordinals don't reshuffle across re-runs
//        that only change which collisions are resolved. Coordinates are already 0-indexed and
//        consistent with `collisions` (translated together, step 3-4 above). ---
resolvedEntries.sort((a, b) => a.y - b.y || a.x - b.x || (a.direction === b.direction ? 0 : a.direction === 'H' ? -1 : 1))
resolvedEntries.forEach((e, i) => { e.ordinal = i })

// --- 7. mint a fragment-specific clue for every resolved entry (collision-free or human-resolved),
//        mirroring mint-connections-tiles.mjs's "screen before write" pattern exactly: status "ok" |
//        "needs_review", reused mechanical backstops, never straight to DB. Always goes through the
//        model -- content_items.clue is NEVER reused verbatim, even for a single-word term whose
//        fragmentsOf() yields only this one fragment, per db/013_add_crossword.sql's own header:
//        content_items.clue is a full term-level definitional sentence and crossword_entries.clue is
//        a fragment-specific *contextualizing device*, a settled distinction, not an open question.
//        Two prompts, both grounded strictly in the term's own already-vetted `clue` column (no
//        outside knowledge, no raw deck excerpt needed -- content_items.clue is itself already
//        source-grounded): one for a fragment that is only PART of a multi-word term (masks the
//        fragment out of the term), one for the whole-term case (no larger term to reference around
//        it, just a punchier rewrite of the existing definition). ---
let client = null
const ensureClient = () => { if (!client) client = createClient(provider, { model: modelFlag }); return client }

const CLUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'clue', 'reason'],
  properties: {
    status: { type: 'string', enum: ['ok', 'insufficient'] },
    clue: { type: ['string', 'null'] },
    reason: { type: ['string', 'null'] },
  },
}

const cluePromptForFragment = (fragment, term, definitionalClue) => `You are writing ONE short crossword clue for a WORD-FRAGMENT that was extracted from a longer, multi-word term and placed into a crossword grid as its own entry. The grid answer the student must fill in is the fragment itself -- NOT the whole term.

Fragment (the actual grid answer -- do not use this word or an obvious inflection of it anywhere in your clue): "${fragment}"
Full term this fragment was extracted from: "${term}"
Existing, already-vetted definition of the FULL term (the ONLY thing you may draw on -- no outside knowledge):
"""
${definitionalClue}
"""

Write a clue that:
- Helps the student identify "${fragment}" as ONE PIECE of the term "${term}" -- for example by referencing the term with the fragment masked out (if the term is "Edge Computing" and the fragment is "EDGE", a valid style is "___ Computing -- processing done near the data source rather than a centralized cloud, per the definition above") or by describing what that piece specifically contributes to the term's meaning.
- Never contains "${fragment}" itself, or an obvious inflection of it, anywhere in the clue text.
- Draws only on the definition given above -- do not add outside knowledge about "${term}" or "${fragment}" that the definition doesn't state.
- Never refers to "the slide", "the deck", "the grid", "this crossword", or the presentation itself -- it must stand alone as a clue.

If the definition above does not give you enough to write a clue meeting ALL of the above without using the fragment word itself, return status "insufficient" with a one-sentence reason instead of guessing. Returning "insufficient" is the correct and expected answer when the material doesn't support it, not a failure to avoid.`

// Whole-term case: the term IS a single word and that word is exactly the grid entry (no larger
// multi-word term to reference around it). content_items.clue is still the only grounding allowed,
// but it must never be copied verbatim (db/013_add_crossword.sql: a crossword entry's clue is a
// "contextualizing device", not the same register as the full definitional sentence) -- rewrite it
// into a short crossword-style clue instead.
const cluePromptForWholeTermFragment = (fragment, definitionalClue) => `You are writing ONE short crossword clue. The grid answer the student must fill in is a single word: "${fragment}".

Existing, already-vetted definition of "${fragment}" (the ONLY thing you may draw on -- no outside knowledge):
"""
${definitionalClue}
"""

Write a SHORT crossword-style clue (not a copy of the definition above -- rephrase it into a punchier, more compact crossword register) that:
- Would let a student who knows the material identify "${fragment}" from the clue alone.
- Never contains "${fragment}" itself, or an obvious inflection of it, anywhere in the clue text.
- Draws only on the definition given above -- do not add outside knowledge.
- Never refers to "the slide", "the deck", "the grid", "this crossword", or the presentation itself -- it must stand alone as a clue.

If the definition above does not give you enough to write a clue meeting ALL of the above without using the word itself, return status "insufficient" with a one-sentence reason instead of guessing.`

function runBackstop(fragment, clueText, page) {
  const asItem = { term: fragment, clue: clueText, example_sentence: null, page }
  return checkClueLeak(asItem) || checkChartTitle(asItem) || checkSourceLeak(asItem) || checkProvenance(asItem, new Set())
}

let tokensIn = 0, tokensOut = 0
for (const e of resolvedEntries) {
  const row = rowsById.get(e.contentItemId)
  const page = row?.page ?? null

  // Carry forward a prior human-approved clue (re-verified, never trusted blind -- a human edit could
  // still introduce a leak the backstop would catch).
  const reviewed = reviewedEntryByItemId.get(e.contentItemId)
  if (reviewed && reviewed.clueStatus === 'ok' && reviewed.clue && reviewed.fragment === e.fragment) {
    const fail = runBackstop(e.fragment, reviewed.clue, page)
    if (!fail) {
      e.clue = reviewed.clue; e.clueStatus = 'ok'; e.clueReason = 'carried forward from --review-file'
      console.log(`  "${e.fragment}" (${e.term}): clue carried forward from --review-file, no model call.`)
      continue
    }
    console.log(`  "${e.fragment}" (${e.term}): --review-file clue failed backstop "${fail.rule}" on re-check -- re-minting.`)
  }

  if (!row?.clue) {
    e.clue = null; e.clueStatus = 'needs_review'; e.clueReason = `content_items row ${e.contentItemId} has no clue to ground a mint against.`
    console.log(`  "${e.fragment}" (${e.term}): needs_review -- no source clue to ground against.`)
    continue
  }

  // Never reuse content_items.clue verbatim, even when the term collapses to exactly this one
  // fragment (a single-word term) -- db/013_add_crossword.sql's own header is explicit that
  // content_items.clue is a full term-level definitional sentence and crossword_entries.clue is a
  // fragment-specific *contextualizing device*, and that the two must never be conflated (a settled
  // call, not an open question here). Always mint through the model; the whole-term case just gets a
  // simpler prompt since there's no larger term to reference around the fragment.
  const termFrags = rowFragsById.get(e.contentItemId)
  const isWholeTerm = termFrags.length === 1 && termFrags[0] === e.fragment
  const prompt = isWholeTerm
    ? cluePromptForWholeTermFragment(e.fragment, row.clue)
    : cluePromptForFragment(e.fragment, e.term, row.clue)

  let result
  try {
    const { data, usage } = await ensureClient().generateJSON({ ref: null, prompt, schema: CLUE_SCHEMA })
    result = data
    tokensIn += usage.in ?? 0; tokensOut += usage.out ?? 0
  } catch (err) {
    e.clue = null; e.clueStatus = 'needs_review'; e.clueReason = `model call failed: ${err.message}`
    console.log(`  "${e.fragment}" (${e.term}): model call FAILED -- ${err.message}`)
    continue
  }

  if (result.status !== 'ok' || !result.clue) {
    e.clue = null; e.clueStatus = 'needs_review'; e.clueReason = result.reason || 'model returned "insufficient" with no reason given'
    console.log(`  "${e.fragment}" (${e.term}): needs_review (model) -- ${result.reason ?? '(no reason given)'}`)
    continue
  }

  const fail = runBackstop(e.fragment, result.clue, page)
  if (fail) {
    e.clue = result.clue; e.clueStatus = 'needs_review'; e.clueReason = `failed backstop check "${fail.rule}": ${fail.quote}`
    console.log(`  "${e.fragment}" (${e.term}): needs_review (backstop "${fail.rule}") -- ${fail.quote}`)
    continue
  }

  e.clue = result.clue; e.clueStatus = 'ok'; e.clueReason = null
  console.log(`  "${e.fragment}" (${e.term}): ok -- "${result.clue}"`)
}
console.log(`\nClue minting: ${resolvedEntries.filter((e) => e.clueStatus === 'ok').length}/${resolvedEntries.length} ok. Tokens: ${tokensIn} in, ${tokensOut} out.\n`)

// --- 8. board id (natural key: source_id + sorted resolved content_item_ids -- see crossword-plan.mjs) ---
const boardId = computeBoardId(sourceId, [...resolvedEntries.map((e) => e.contentItemId)].sort())

// --- 9. write the reviewable JSON -- always, both dry-run and commit, so --out reflects this
//        invocation's resolved state (mirrors author-connections-boards.mjs's "print the plan" step,
//        and mint-connections-tiles.mjs writing --out unconditionally). ---
const outData = {
  sourceId, subject, boardId, width, height,
  generatedAt: new Date().toISOString(),
  restarts, minLen, maxLen,
  entries: resolvedEntries.map((e) => ({
    ordinal: e.ordinal, contentItemId: e.contentItemId, term: e.term, fragment: e.fragment,
    x: e.x, y: e.y, direction: e.direction, clue: e.clue, clueStatus: e.clueStatus, clueReason: e.clueReason,
  })),
  collisions,
  excluded,
}
writeFileSync(outPath, JSON.stringify(outData, null, 2))
console.log(`Wrote ${outPath}.`)

console.log(`\n=== ${sourceId} -> crossword_boards.id ${boardId} (subject "${subject}") ===`)
console.log(`  grid: ${width}x${height}, ${resolvedEntries.length} entr(y/ies), ${collisions.length} collision(s) pending, ${excluded.length} excluded.`)

// --- 10. --dry-run stops here. ---
if (DRY_RUN) {
  console.log('\nDRY RUN -- nothing written. Resolve any collisions/needs_review clues in the JSON above, ' +
    `re-run with --review-file ${outPath}, then pass --commit.`)
  process.exit(0)
}

// --- 11. --commit gate: refuse the WHOLE run (write nothing) if any collision remains unresolved or
//         any entry's clue is not "ok" -- validate everything, then write, or write nothing. ---
const problems = []
for (const c of collisions) problems.push(`fragment "${c.fragment}" @ (${c.x},${c.y}) ${c.direction} is an unresolved collision among: ${c.claimants.map((cl) => cl.term).join(', ')}`)
for (const e of resolvedEntries) if (e.clueStatus !== 'ok') problems.push(`entry "${e.fragment}" (${e.term}) has clueStatus "${e.clueStatus}": ${e.clueReason}`)
if (problems.length) {
  console.error(`\n--commit refused -- ${problems.length} problem(s) remain, nothing written:`)
  for (const p of problems) console.error(`  - ${p}`)
  console.error(`\nResolve these in ${outPath} (or the --review-file you passed) and re-run.`)
  process.exit(2)
}

// --- 12. write: crossword_boards + crossword_entries, one transaction (real atomicity over Neon's
//         HTTP driver, same mechanism author-connections-boards.mjs uses). ---
const queries = []
queries.push(sql`
  insert into crossword_boards (id, subject, source_id, width, height)
  values (${boardId}, ${subject}, ${sourceId}, ${width}, ${height})
  on conflict (id) do update set subject = excluded.subject, source_id = excluded.source_id, width = excluded.width, height = excluded.height
`)
for (const e of resolvedEntries) {
  queries.push(sql`
    insert into crossword_entries (board_id, content_item_id, fragment, x, y, direction, ordinal, clue)
    values (${boardId}, ${e.contentItemId}, ${e.fragment}, ${e.x}, ${e.y}, ${e.direction}, ${e.ordinal}, ${e.clue})
    on conflict (board_id, ordinal) do update set
      content_item_id = excluded.content_item_id, fragment = excluded.fragment,
      x = excluded.x, y = excluded.y, direction = excluded.direction, clue = excluded.clue
  `)
}
await sql.transaction(queries)
console.log(`\nCommitted: 1 board, ${resolvedEntries.length} entr(y/ies), in one transaction.`)

// --- 13. post-write verification, using db/013's own two documented read-only queries, scoped to
//         this board -- log-and-flag on a violation (already committed, so flag for investigation
//         rather than attempt a rollback, matching author-connections-boards.mjs's posture). ---
// CAUGHT AT RUNTIME, TWO BUGS (first real --commit against live Neon; db/013's own
// header comment carried the identical query, unexecuted until now):
//   1. "cells" never selected x/y/direction at all, so the "expanded" CTE's
//      reference to e.x/e.y didn't exist (Postgres 42703) -- the self-join against
//      a second copy of crossword_entries (aliased "d") was there ONLY to source
//      x/y/direction, and was never necessary.
//   2. Once fixed naively by pulling x/y/direction off the join partner "d", the
//      unqualified board_id/ordinal/content_item_id in the SELECT list became
//      ambiguous between "cells e" and "crossword_entries d" (Postgres 42702).
// Both are solved by adding x/y/direction to "cells" directly and dropping the
// self-join entirely -- simpler than the original design, not just qualified.
const cellConflicts = await sql`
  with cells as (
    select board_id, ordinal, content_item_id, x, y, direction,
      generate_series(0, length(fragment) - 1) as i, fragment
    from crossword_entries where board_id = ${boardId}
  ), expanded as (
    select board_id, ordinal, content_item_id,
      case when direction = 'H' then x + i else x end as cx,
      case when direction = 'H' then y else y + i end as cy,
      substr(fragment, i + 1, 1) as letter
    from cells
  )
  select cx, cy, count(distinct letter)::int as conflicting_letters
  from expanded
  group by cx, cy
  having count(distinct letter) > 1
`
const provenanceMismatches = await sql`
  select ce.ordinal, ce.fragment, ci.term
  from crossword_entries ce
  join content_items ci on ci.id = ce.content_item_id
  where ce.board_id = ${boardId} and position(upper(ce.fragment) in upper(ci.term)) = 0
`
console.log(`\nPost-write verification (expect 0 rows in each):`)
console.log(`  shared cells with conflicting letters: ${cellConflicts.length}`)
console.log(`  entries whose fragment is not a substring of its linked term: ${provenanceMismatches.length}`)
if (cellConflicts.length || provenanceMismatches.length) {
  console.error('\nPost-write verification found a violated invariant despite pre-write checks passing -- investigate before trusting this board.')
  process.exitCode = 2
}
