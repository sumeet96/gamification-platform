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

import { readFileSync, writeFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'

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
const OUT = arg('--out', 'spike-data/terms-mcq.json')
const EXC = arg('--excerpts', 'spike-data/excerpts-terms-mcq.json')

const DB = process.env.DATABASE_URL
if (!DB) { console.error('Missing DATABASE_URL.'); process.exit(1) }
const sql = neon(DB)

// Deterministic per-item shuffle: the option order must not change between runs,
// or the same item would present differently to the simulator each time and the
// difficulty estimate would carry that noise. Seeded from the item id, never its
// position in the result set -- same rule as options.seed in the simulator.
function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
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

const rows = await sql`
  select id, subject, topic, term, clue, distractors, source_excerpt, page
  from content_items
  where kind = 'term_definition'
    and term is not null and clue is not null
    and jsonb_array_length(distractors) >= 3
  order by id
`

const questions = []
const excerpts = []
let skipped = 0

for (const r of rows) {
  const distractors = (Array.isArray(r.distractors) ? r.distractors : []).slice(0, 3)
  if (distractors.length < 3) { skipped++; continue }
  // Exactly the four options the game shows, in a stable order.
  const options = seededShuffle([r.term, ...distractors], hash(r.id))
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
