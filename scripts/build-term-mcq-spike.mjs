#!/usr/bin/env node
// Renders every `term_definition` row as the MCQ that choose-the-right-word
// actually shows a student -- clue as the stem, term + distractors as the
// options -- so the difficulty simulator can attempt it.
//
// Why this exists. The simulator (scripts/lib/simulate-students.mjs) ends every
// prompt with "Answer with a single letter (A, B, C or D)". That was read as
// "term items cannot be calibrated, the instrument is MCQ-only". That reading
// was true of the raw primitive and became false the moment package A3 shipped:
// a term item IS an MCQ once its distractors are used as options. This script
// is the whole of the "rendering shim" -- there is no new method here, which is
// the point.
//
// It also fixes a narrower mistake: the simulator bake-off was scoring
// candidate models on slide-derived CONCEPTUAL MCQs and the result was going to
// be used to pick a simulator for TERM items. Different task shape (short
// noun-phrase options, recall-a-label rather than reason-about-a-concept), so
// that was an extrapolation. This file is the item type we actually need to
// calibrate, and the bake-off should be decided on it.
//
// Usage:
//   node scripts/build-term-mcq-spike.mjs [--out spike-data/terms-mcq.json]
//                                         [--excerpts spike-data/excerpts-terms-mcq.json]
//
// Output aligns by index with the excerpts file, which is what --source expects.
//
// --from-json <file...> (added 3 Aug 2026): reads one or more generate-terms.mjs `--dry-run --out`
// files instead of `content_items`, so freshly generated items can go through the gap screen
// (analyse-item-gap.mjs) BEFORE any decision to write them to the database. Screening items
// already in the DB would mean putting unscreened content in front of students first. Renders
// exactly the same MCQ shape as the DB path below -- this flag changes the SOURCE, not the
// rendering. Never touches the database.
//
//   node scripts/build-term-mcq-spike.mjs --from-json spike-data/gen2-cage.json spike-data/gen2-tw.json spike-data/gen2-cb.json
//                                         [--subject "Digital Transformation"]
//
// Defaults shift to spike-data/gen2-mcq.json / spike-data/excerpts-gen2-mcq.json in this mode
// (explicit --out/--excerpts still win), so the DB-path default files are never clobbered.

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { validateTerms } from './lib/terms-validate.mjs'
import { hashId } from './lib/simulate-students.mjs'
import { normaliseTermKey } from './lib/term-dedup.mjs'

try {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* fall through to a real env var */ }

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}
// Multi-value flag: everything after `name` up to the next `--flag` or end of argv.
const argMulti = (name) => {
  const i = process.argv.indexOf(name)
  if (i === -1) return []
  const out = []
  for (let j = i + 1; j < process.argv.length && !process.argv[j].startsWith('--'); j++) out.push(process.argv[j])
  return out
}
const FROM_JSON = argMulti('--from-json')
// content_items is subject-scoped (PROJECT_MAP §1.5), but generate-terms.mjs's --dry-run --out
// files don't carry `subject` per item -- it's a CLI flag on that run, not a field on the row.
// "Digital Transformation" is the pilot's one and only subject today, so it's the right default
// for a row that would be written under it; --subject overrides for a future non-pilot run.
const SUBJECT = arg('--subject', 'Digital Transformation')
// --validated-only: emit only the rows terms-validate.mjs's live rules would still pass, since
// the repairable ones are getting new distractors later and distractors drive an MCQ's difficulty.
// Default paths shift so the reproducible bake-off inputs (terms-mcq.json / excerpts-terms-mcq.json)
// are never clobbered; an explicit --out/--excerpts still wins over either default. --from-json gets
// its own default pair for the same reason.
const VALIDATED_ONLY = process.argv.includes('--validated-only')
const OUT = arg('--out', FROM_JSON.length ? 'spike-data/gen2-mcq.json' : (VALIDATED_ONLY ? 'spike-data/terms-mcq-clean.json' : 'spike-data/terms-mcq.json'))
const EXC = arg('--excerpts', FROM_JSON.length ? 'spike-data/excerpts-gen2-mcq.json' : (VALIDATED_ONLY ? 'spike-data/excerpts-terms-mcq-clean.json' : 'spike-data/excerpts-terms-mcq.json'))

// Deterministic per-item shuffle: the option order must not change between runs,
// or the same item would present differently to the simulator each time and the
// difficulty estimate would carry that noise. Seeded from the item id, never its
// position in the result set -- same rule as options.seed in the simulator. (`hash`
// itself now lives in lib/simulate-students.mjs as `hashId`, shared with
// spike-simulate-difficulty.mjs, so there is one id-hash implementation, not two.)
function seededShuffle(arr, seed) {
  const a = arr.slice()
  let s = seed || 1
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

let usableRows

if (FROM_JSON.length) {
  // --from-json: read generator dry-run output instead of content_items. These files already
  // hold only validateTerms's `passed` set (generate-terms.mjs writes `passed`, not `drafts`, to
  // --out), so there is no census/repair step here -- that already happened at generation time.
  let totalIn = 0
  const rawItems = []
  for (const file of FROM_JSON) {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(parsed)) { console.error(`${file}: not a JSON array, skipping.`); continue }
    totalIn += parsed.length
    for (const item of parsed) rawItems.push({ ...item, _file: file })
  }

  // Cross-file dedup by CONCEPT, not exact string, scoped to SUBJECT -- content_items is
  // subject-scoped, so the same normalised key in a different subject must not merge. Keep the
  // first occurrence (file order as given on the command line); log every collision loudly, since
  // this silently drops a generated item otherwise.
  const seenByKey = new Map() // `${subject}::${normalisedKey}` -> the original term string kept
  const deduped = []
  let merged = 0
  for (const item of rawItems) {
    const key = `${SUBJECT}::${normaliseTermKey(item.term)}`
    const kept = seenByKey.get(key)
    if (kept) {
      merged++
      console.error(`merged (same concept): kept "${kept}", dropped "${item.term}" [${item._file}]`)
      continue
    }
    seenByKey.set(key, item.term)
    deduped.push(item)
  }

  // Grounding is the whole method (see the excerpt-empty warning below too) -- an item with no
  // source_excerpt can't be simulated at all, so it is dropped here rather than reaching the
  // "empty excerpt" warning silently.
  let noExcerptSkipped = 0
  const withExcerpt = []
  for (const item of deduped) {
    if (!item.source_excerpt || !item.source_excerpt.trim()) {
      noExcerptSkipped++
      console.error(`skipped (no source_excerpt): "${item.term}" [${item._file}]`)
      continue
    }
    withExcerpt.push(item)
  }

  usableRows = withExcerpt.map((item) => ({
    // Same formula generate-terms.mjs uses when it upserts to content_items (line ~391): identity
    // has to match what the row would get if written later, so a screen result can be joined back
    // to it. `item.id` wins if the source file ever carries one.
    id: item.id ?? createHash('sha256').update(`${SUBJECT}::${item.term}`).digest('hex').slice(0, 32),
    subject: SUBJECT,
    topic: item.topic ?? SUBJECT,
    term: item.term,
    clue: item.clue,
    distractors: item.distractors,
    source_excerpt: item.source_excerpt,
    page: item.page ?? null,
  }))

  console.error(
    `--from-json: ${totalIn} item(s) in from ${FROM_JSON.length} file(s) -> ${merged} merged by dedup, ` +
    `${noExcerptSkipped} skipped (no source_excerpt), ${usableRows.length} usable.`
  )
} else {
  const DB = process.env.DATABASE_URL
  if (!DB) { console.error('Missing DATABASE_URL.'); process.exit(1) }
  const sql = neon(DB)

  // DELIBERATELY does not filter out retired rows (db/009_add_item_retirement.sql
  // added `retired_at`/`retired_reason`). This feeds research tooling, not student
  // play, and the quality screen being built next needs to see every item --
  // including the withdrawn ones -- so it can be validated against items already
  // known to be bad. Do not add a retired-row exclusion clause here; that
  // belongs on the student-facing selection queries (app/api/questions,
  // app/api/word/question, app/api/match/board), not this one.
  const rows = await sql`
    select id, subject, topic, term, clue, distractors, source_excerpt, page,
           cognitive_level, example_sentence, variants
    from content_items
    where kind = 'term_definition'
      and term is not null and clue is not null
      and jsonb_array_length(distractors) >= 3
    order by id
  `

  // Census against terms-validate.mjs's live rules -- printed on every run, not just
  // --validated-only, so a plain run also records how many of the 50 would ship unchanged.
  // Rows are mapped to the shape the checks actually read (see terms-validate.mjs:325); `id` is kept
  // out of that shape and re-attached by array index so the option shuffle (seeded on r.id) never sees it.
  const validationItems = rows.map((r) => ({
    term: r.term,
    clue: r.clue,
    example_sentence: r.example_sentence,
    variants: Array.isArray(r.variants) ? r.variants : [],
    distractors: Array.isArray(r.distractors) ? r.distractors : [],
    cognitive_level: r.cognitive_level,
    page: r.page,
  }))
  const { passed, rejected, repairable } = validateTerms(validationItems)
  console.error(
    `census: ${rows.length} rows -> ${passed.length} clean, ${repairable.length} repairable, ${rejected.length} rejected`
  )
  for (const { index, rule } of rejected) console.error(`  rejected   ${rows[index].id} [${rule}] ${rows[index].term}`)
  for (const { index, rule } of repairable) console.error(`  repairable ${rows[index].id} [${rule}] ${rows[index].term}`)

  const passedSet = new Set(passed)
  usableRows = VALIDATED_ONLY ? rows.filter((r, i) => passedSet.has(validationItems[i])) : rows
}

const questions = []
const excerpts = []
let skipped = 0

for (const r of usableRows) {
  const distractors = (Array.isArray(r.distractors) ? r.distractors : []).slice(0, 3)
  if (distractors.length < 3) { skipped++; continue }
  // Exactly the four options the game shows, in a stable order.
  const options = seededShuffle([r.term, ...distractors], hashId(r.id))
  const answer = options.indexOf(r.term)
  if (answer < 0) { skipped++; continue }

  questions.push({
    id: r.id,
    topic: r.topic ?? r.subject,
    subject: r.subject,
    // The simulator reads `prompt`/`options`/`answer` -- same shape as the MCQ
    // spike decks, so no change to the instrument is needed.
    prompt: r.clue,
    options,
    answer,
    page: r.page,
    difficulty: null, // uncalibrated by construction; that is what this run produces
  })
  excerpts.push({
    i: excerpts.length,
    source_page: r.page ?? null,
    title: r.topic ?? r.subject ?? 'course material',
    text: r.source_excerpt ?? '',
  })
}

const noExcerpt = excerpts.filter((e) => !e.text.trim()).length
writeFileSync(OUT, JSON.stringify(questions, null, 2))
writeFileSync(EXC, JSON.stringify(excerpts, null, 2))

console.log(`Rendered ${questions.length} term items as 4-option MCQs.`)
if (skipped) console.log(`Skipped ${skipped} (fewer than 3 usable distractors).`)
if (noExcerpt) {
  // Grounding is the whole method -- an item with no excerpt gets an empty
  // "memory", which measures source-independence, not difficulty. Loud, not silent.
  console.log(`WARNING: ${noExcerpt} item(s) have an EMPTY source_excerpt and cannot be grounded.`)
}
const bySubject = {}
for (const q of questions) bySubject[q.subject] = (bySubject[q.subject] ?? 0) + 1
console.log('By subject:', JSON.stringify(bySubject))
console.log(`Wrote ${OUT} and ${EXC}`)
