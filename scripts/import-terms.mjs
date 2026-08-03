#!/usr/bin/env node
// Imports an already-screened cohort of term_definition items -- generate-terms.mjs
// `--dry-run --out` JSON -- into content_items, and retires the term_definition rows it
// supersedes within the same subject. It never regenerates: generation is not deterministic, so
// re-running generate-terms.mjs would write a DIFFERENT set than the one that was screened. This
// script writes EXACTLY the screened JSON, nothing more.
//
// Usage:
//   node scripts/import-terms.mjs --subject "International Management" \
//     --from-json spike-data/gen3-cage.json \
//     --source-id 8f16da856f5cd4c9359d785c \
//     [--expect 9] [--dry-run | --commit]
//
//   node scripts/import-terms.mjs --subject "Digital Transformation" \
//     --from-json spike-data/gen3-tw.json spike-data/gen3-cb.json \
//     --source-id 1a2f4d8a2b74a3e3bdb36e79 a6757f907cdbeef6c74234f0 \
//     [--expect 25] [--dry-run | --commit]
//
// --subject is REQUIRED, never defaulted: it is part of sha256(subject::term) (see
// term-import-plan.mjs computeTermId) -- a wrong subject mints ids matching nothing.
//
// --source-id supplies one existing `sources` row id per --from-json file, in the SAME order --
// this script looks sources up, it never creates one. A multi-file invocation (e.g. the two
// Digital Transformation decks) tags each item with the source_id of the file it came from.
//
// --dry-run is the DEFAULT. It prints the full plan -- every insert, every update-in-place, every
// retirement, with terms -- and writes nothing. --commit is the only way to write, and does so in
// a single transaction (all inserts + the retirement UPDATE), so a failure leaves nothing
// half-applied.
//
// Scoping, deliberately: dedup, human exclusions, and the retirement diff are all SUBJECT-scoped
// to this invocation, mirroring build-term-mcq-spike.mjs's --from-json model (content_items is
// subject-scoped from day one). Retirement only ever touches live term_definition rows in THIS
// invocation's subject -- an invocation that only ever saw one subject's cohort has no business
// retiring another subject's rows.

import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { loadEnv } from './lib/llm-client.mjs'
import { normaliseTermKey } from './lib/term-dedup.mjs'
import { computeTermId, applyHumanExclusions, retirementDiff, HUMAN_EXCLUSIONS_BY_SUBJECT } from './lib/term-import-plan.mjs'

loadEnv()

const USAGE = 'Usage: node scripts/import-terms.mjs --subject "Name" --from-json f1 [f2 ...] --source-id id1 [id2 ...] [--expect N] [--dry-run|--commit]'
const die = (msg) => { console.error(`${msg}\n${USAGE}`); process.exit(1) }

const flag = (name, fallback = null) => {
  const i = process.argv.indexOf(name)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  if (!v || v.startsWith('--')) die(`${name} needs a value.`)
  return v
}
const argMulti = (name) => {
  const i = process.argv.indexOf(name)
  if (i === -1) return []
  const out = []
  for (let j = i + 1; j < process.argv.length && !process.argv[j].startsWith('--'); j++) out.push(process.argv[j])
  return out
}

const subject = flag('--subject')
if (!subject) die('--subject is required: content_items is subject-scoped, and subject is part of the id hash. Do not default it.')

const files = argMulti('--from-json')
if (!files.length) die('At least one --from-json file is required.')

const sourceIdArgs = argMulti('--source-id')
if (sourceIdArgs.length !== files.length) {
  die(`--source-id must supply exactly one id per --from-json file (${files.length} file(s), ${sourceIdArgs.length} id(s)).`)
}

const EXPECT = flag('--expect')
const expectN = EXPECT === null ? null : Number(EXPECT)
if (EXPECT !== null && (!Number.isInteger(expectN) || expectN < 0)) die('--expect must be a non-negative integer.')

const COMMIT = process.argv.includes('--commit')
const DRY_RUN_FLAG = process.argv.includes('--dry-run')
if (COMMIT && DRY_RUN_FLAG) die('--dry-run and --commit are mutually exclusive.')
const DRY_RUN = !COMMIT // dry-run is the default; --commit is the only way to write

// Generation provenance the screened JSON does NOT carry (generate-terms.mjs's --dry-run --out
// writes `passed`, which never had generator_model/recipe attached -- those are computed only at
// DB-write time in the live generator, line ~411-418). Every existing term_definition row in the
// database was written as 'openai/gpt-4.1-mini' / recipe window3, uniformly, across all three
// decks -- this is the project's standing generation default (CLAUDE.md) and the only value with
// any evidence behind it, so it is used here rather than left null. FLAGGED in the report: this
// is an inference, not a value read from a generation-run record, because no record exists.
const GENERATOR_MODEL = 'openai/gpt-4.1-mini'
const RECIPE_WINDOW = 'window3'

// --- 1. read + tag ---
const rawItems = []
for (let i = 0; i < files.length; i++) {
  const file = files[i]
  const sourceId = sourceIdArgs[i]
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    die(`Could not read/parse ${file}: ${err.message}`)
  }
  if (!Array.isArray(parsed)) die(`${file} is not a JSON array of screened items.`)
  for (const item of parsed) rawItems.push({ ...item, _file: file, _sourceId: sourceId })
}
console.log(`Read ${rawItems.length} item(s) from ${files.length} file(s) for subject "${subject}".`)

// --- 2. subject-scoped dedup, same concept as build-term-mcq-spike.mjs's --from-json path:
//        normalise, keep first occurrence in file order (as given on the command line), log every
//        merge loudly. Reused via scripts/lib/term-dedup.mjs, not reimplemented. ---
const seenByKey = new Map()
const deduped = []
let mergedCount = 0
for (const item of rawItems) {
  const key = `${subject}::${normaliseTermKey(item.term)}`
  const kept = seenByKey.get(key)
  if (kept) {
    mergedCount++
    console.log(`  merged (same concept): kept "${kept}", dropped "${item.term}" [${item._file}]`)
    continue
  }
  seenByKey.set(key, item.term)
  deduped.push(item)
}
console.log(`After dedup: ${deduped.length} item(s) (${mergedCount} merged).`)

// --- 3. human exclusions, exact term string, subject-scoped, fails loud on a miss ---
let kept, excludedItems
try {
  ;({ kept, excluded: excludedItems } = applyHumanExclusions(deduped, subject))
} catch (err) {
  die(err.message)
}
if (excludedItems.length) {
  console.log(`Human exclusions applied (${excludedItems.length}):`)
  for (const e of excludedItems) console.log(`  excluded: "${e.term}" [${e._file}]`)
} else if (HUMAN_EXCLUSIONS_BY_SUBJECT[subject]) {
  console.log('Human exclusions applied (0) -- none configured were absent, none needed.')
}

console.log(`Final cohort for "${subject}": ${kept.length} item(s).`)
if (expectN !== null && kept.length !== expectN) {
  console.error(`\nMISMATCH: expected ${expectN} item(s) after dedup + exclusions, got ${kept.length}. Not proceeding without this being said explicitly.`)
  if (COMMIT) { console.error('Aborting before any write.'); process.exit(2) }
} else if (expectN !== null) {
  console.log(`Matches --expect ${expectN}.`)
}

// --- 4. compute ids ---
const finalItems = kept.map((item) => ({ ...item, id: computeTermId(subject, item.term) }))

// --- 5. DB: verify sources, classify each id (new / update-live / update-RETIRED), fetch the live
//         pool for the retirement diff ---
const DB = process.env.DATABASE_URL
if (!DB) die('Missing DATABASE_URL.')
const sql = neon(DB)

const distinctSourceIds = [...new Set(sourceIdArgs)]
const sourceRows = await sql`select id, subject, title from sources where id = any(${distinctSourceIds})`
const sourceById = new Map(sourceRows.map((r) => [r.id, r]))
for (const id of distinctSourceIds) {
  const row = sourceById.get(id)
  if (!row) die(`sources row "${id}" does not exist. Refusing to write against a source that isn't there.`)
  if (row.subject !== subject) {
    die(`sources row "${id}" ("${row.title}") is subject "${row.subject}", not "${subject}" -- refusing to proceed on a subject mismatch.`)
  }
}
console.log(`Verified ${distinctSourceIds.length} source(s) exist and match subject "${subject}".`)

const finalIds = finalItems.map((i) => i.id)
const existingById = new Map(
  (await sql`select id, term, retired_at, retired_reason from content_items where id = any(${finalIds})`)
    .map((r) => [r.id, r])
)

const inserts = [], updatesLive = [], updatesRetired = []
for (const item of finalItems) {
  const existing = existingById.get(item.id)
  if (!existing) inserts.push(item)
  else if (existing.retired_at) updatesRetired.push({ item, existing })
  else updatesLive.push({ item, existing })
}

const liveRows = await sql`
  select id, term from content_items
  where kind = 'term_definition' and subject = ${subject} and retired_at is null
`
const retireIds = retirementDiff(liveRows.map((r) => r.id), finalIds)
const retireRows = liveRows.filter((r) => retireIds.includes(r.id))

// --- 6. print the plan ---
console.log(`\n=== PLAN for subject "${subject}" ===`)
console.log(`  ${inserts.length} new insert(s):`)
for (const i of inserts) console.log(`    + ${i.term}  [${i._file} -> source ${i._sourceId}]`)
console.log(`  ${updatesLive.length} update-in-place (live row, content refreshed):`)
for (const { item, existing } of updatesLive) console.log(`    ~ ${item.term}  (id ${item.id}, was "${existing.term}")`)
if (updatesRetired.length) {
  console.log(`  ${updatesRetired.length} update-in-place on a RETIRED row (content refreshed, retired_at/retired_reason left UNTOUCHED -- NOT un-retired):`)
  for (const { item, existing } of updatesRetired) console.log(`    ! ${item.term}  (id ${item.id}, retired_reason=${existing.retired_reason})`)
}
console.log(`  ${retireRows.length} retirement(s) (live -> superseded, not in the imported set):`)
for (const r of retireRows) console.log(`    - ${r.term}  (id ${r.id})`)
console.log(`  Live "${subject}" term_definition rows before: ${liveRows.length}. After (projected): ${liveRows.length - retireRows.length + inserts.length}.`)

// Everything past this point only runs for --commit, and nothing before this point has opened a
// DB connection-affecting failure path -- process.exit() after an await'd fetch trips a
// Node-on-Windows libuv assertion (UV_HANDLE_CLOSING) if a keep-alive socket is still tearing
// down, so from here on this script sets process.exitCode and lets execution fall off the end
// naturally instead of forcing an exit.
if (DRY_RUN) {
  console.log('\nDRY RUN -- nothing written. Pass --commit to apply.')
} else if (expectN !== null && kept.length !== expectN) {
  // Already reported above; belt-and-braces stop before the transaction.
  process.exitCode = 2
} else {
  // --- 7. write: one transaction, inserts reusing generate-terms.mjs's exact column list and
  //         on-conflict clause, plus the retirement UPDATE against the explicit id list ---
  const upserts = finalItems.map((t) => {
    const recipe = `term_definition/${t.cognitive_level}/${RECIPE_WINDOW}`
    return sql`
      insert into content_items (
        id, source_id, subject, topic, page, kind, cognitive_level, recipe,
        generator_model, term, clue, example_sentence, variants, distractors, source_excerpt
      ) values (
        ${t.id}, ${t._sourceId}, ${subject}, ${t.topic ?? null}, ${t.page}, 'term_definition', ${t.cognitive_level}, ${recipe},
        ${GENERATOR_MODEL}, ${t.term}, ${t.clue}, ${t.example_sentence ?? null},
        ${JSON.stringify(t.variants)}::jsonb, ${JSON.stringify(t.distractors)}::jsonb, ${t.source_excerpt ?? null}
      )
      on conflict (id) do update set
        topic = excluded.topic, page = excluded.page, cognitive_level = excluded.cognitive_level,
        recipe = excluded.recipe, generator_model = excluded.generator_model, clue = excluded.clue,
        example_sentence = excluded.example_sentence, variants = excluded.variants,
        distractors = excluded.distractors, source_excerpt = excluded.source_excerpt
    `
  })

  const queries = [...upserts]
  if (retireIds.length) {
    queries.push(sql`
      update content_items
      set retired_at = now(), retired_reason = 'superseded'
      where id = any(${retireIds})
    `)
  }

  await sql.transaction(queries)
  console.log(`\nCommitted: ${upserts.length} upsert(s), ${retireIds.length} retirement(s), all in one transaction.`)

  // --- 8. verify ---
  const totalCI = (await sql`select count(*)::int as n from content_items`)[0].n
  const breakdown = await sql`
    select subject, (retired_at is null) as live, retired_reason, count(*)::int as n
    from content_items where kind = 'term_definition'
    group by 1, 2, 3 order by 1, 2, 3
  `
  const eventsCount = (await sql`select count(*)::int as n from events`)[0].n
  const nullCheck = await sql`
    select count(*)::int as n from content_items
    where id = any(${finalIds}) and (simulated_p is not null or difficulty is not null or empirical_p is not null)
  `
  console.log(`\ntotal content_items: ${totalCI}`)
  console.log(`term_definition breakdown: ${JSON.stringify(breakdown)}`)
  console.log(`events: ${eventsCount}`)
  console.log(`imported rows with a non-null simulated_p/difficulty/empirical_p: ${nullCheck[0].n} (expect 0)`)
}
