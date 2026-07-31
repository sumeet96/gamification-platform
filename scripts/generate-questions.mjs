#!/usr/bin/env node
// Package G1 — generate MCQs from a slide PDF and write them to `content_items`.
//
// Replaces the whole-document stub. Spec: docs/architecture/generator-spec.md.
//
// The core move: the model no longer chooses which pages to cover, and its self-reported
// provenance is checked rather than trusted. The old run put every question on page 1 when unsure
// and silently ignored 15 of 26 pages. A loop over page windows makes coverage structural, and
// anything claiming a page outside the current window is rejected.
//
// Usage:
//   node scripts/generate-questions.mjs <deck.pdf> --subject "Digital Transformation" [options]
//
// Options:
//   --title "Session 12"     human title for the `sources` row (default: filename)
//   --provider openai|gemini default openai
//   --model <id>             default per provider; Gemini requires GEMINI_MODEL
//   --window N               pages per call (default 3)
//   --per-window K           questions requested per window (default 2)
//   --pages A-B              only this page range, e.g. 1-6 (default: whole deck)
//   --out <file.json>        write the validated set to disk
//   --dry-run                generate and validate, write nothing to the database

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { loadEnv, createClient } from './lib/llm-client.mjs'
import { validateQuestions, answerDistribution } from './lib/questions-validate.mjs'

loadEnv()

const USAGE = 'Usage: node scripts/generate-questions.mjs <deck.pdf> --subject "Name" [--title T] [--provider openai|gemini] [--model M] [--window 3] [--per-window 2] [--pages A-B] [--out f.json] [--dry-run]'
const die = (msg) => { console.error(`${msg}\n${USAGE}`); process.exit(1) }
const flag = (name, fallback = null) => {
  const i = process.argv.indexOf(name)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  if (!v || v.startsWith('--')) die(`${name} needs a value.`)
  return v
}

const pdfPath = process.argv[2]
if (!pdfPath || pdfPath.startsWith('--')) die('Missing <deck.pdf>.')
const subject = flag('--subject')
if (!subject) die('--subject is required: content_items is subject-scoped (PROJECT_MAP §1.5).')
const title = flag('--title') || pdfPath.split(/[\\/]/).pop()
const provider = flag('--provider', 'openai')
const windowSize = Number(flag('--window', 3))
const perWindow = Number(flag('--per-window', 2))
const outPath = flag('--out')
const dryRun = process.argv.includes('--dry-run')
if (!Number.isInteger(windowSize) || windowSize < 1) die('--window must be a positive integer.')
if (!Number.isInteger(perWindow) || perWindow < 1) die('--per-window must be a positive integer.')

// --- page count. pdf-parse is used ONLY for this; the model reads the PDF itself. ---
const pdfBuf = readFileSync(pdfPath)
const pdf = (await import('pdf-parse/lib/pdf-parse.js')).default
const { numpages } = await pdf(pdfBuf)

let [firstPage, lastPage] = [1, numpages]
const range = flag('--pages')
if (range) {
  const m = range.match(/^(\d+)-(\d+)$/)
  if (!m) die('--pages expects a range like 4-12.')
  firstPage = Number(m[1]); lastPage = Number(m[2])
  if (firstPage < 1 || lastPage > numpages || firstPage > lastPage) die(`--pages must sit inside 1-${numpages}.`)
}

const client = createClient(provider, { model: flag('--model') })

// Strict JSON Schema. Constrained decoding guarantees SHAPE, not TRUTH — it cannot know an answer
// is wrong or a page number is a lie, so the validator still runs on everything.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'cognitive_level', 'difficulty', 'prompt', 'options', 'answer', 'page', 'source_excerpt', 'source_layout'],
        properties: {
          topic: { type: 'string' },
          cognitive_level: { type: 'string', enum: ['recall', 'apply', 'discriminate', 'deduce', 'transfer'] },
          difficulty: { type: 'integer' },
          prompt: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answer: { type: 'integer' },
          page: { type: 'integer' },
          source_excerpt: { type: 'string' },
          // Separate from source_excerpt on purpose. Asked for as one field, the model returns a
          // transcription and silently drops the spatial information; asked for as its own field it
          // reliably describes quadrants and axes. That difference decides whether a question about
          // a 2x2 can be answered from the stored excerpt at all.
          source_layout: { type: 'string' },
        },
      },
    },
  },
}

const promptFor = (from, to) => `You are writing multiple-choice quiz questions from a lecture slide deck for university students.

Use ONLY pages ${from} to ${to} of this PDF. Ignore every other page completely.

Write ${perWindow} questions. For each one:
- "page": the single page the question comes from. It MUST be between ${from} and ${to}.
- "source_excerpt": the words on that page, transcribed verbatim, including words inside images.
- "source_layout": if the page is a diagram, chart, matrix or quadrant, describe where things sit —
  what each axis means, which end is which, and which items fall in which quadrant or region. If the
  page has no meaningful spatial arrangement, use an empty string. Do not repeat the transcription
  here.
- "cognitive_level": what the question demands. "recall" = remember a stated fact. "apply" = use a
  definition on a new instance. "discriminate" = tell two similar concepts apart. "deduce" = infer
  from incomplete information. "transfer" = apply to a case not in the material.
- "difficulty": your 1-5 guess. It is a discarded placeholder, so do not labour over it.

Hard rules:
- Exactly 4 options, exactly one correct, "answer" is the 0-based index of the correct one.
- EXACTLY ONE option may be defensible. If two options are both true, the question is broken —
  rewrite it. On a diagram, check that no other item shares the same region as the correct answer.
- Of the ${perWindow} questions, make at most ${Math.max(1, Math.floor(perWindow / 2))} pure "recall".
  Prefer apply, discriminate or deduce where the material supports it. If these pages genuinely only
  support recall, return recall questions rather than inventing content to reach a level.
- The question must stand alone. NEVER refer to "the slide", "the deck", "the diagram above" or the
  presentation itself. A student sees only your question and its options.
- Base every question strictly on pages ${from} to ${to}. Do not use outside knowledge.
- Vary which index is correct.
- If these pages are a title page, a divider, or otherwise carry no teachable content, return an
  empty questions array. Do not invent content to fill the quota.`

// --- window loop ---
console.log(`${title}: ${numpages} pages, generating over ${firstPage}-${lastPage} in windows of ${windowSize} on ${client.provider}/${client.model}${dryRun ? ' (dry run)' : ''}`)
const ref = await client.uploadPdf(pdfPath)
const drafts = []
let outOfWindow = 0
let tokensIn = 0, tokensOut = 0

try {
  for (let from = firstPage; from <= lastPage; from += windowSize) {
    const to = Math.min(from + windowSize - 1, lastPage)
    let batch = []
    try {
      const { data, usage } = await client.generateJSON({ ref, prompt: promptFor(from, to), schema: SCHEMA })
      batch = Array.isArray(data?.questions) ? data.questions : []
      tokensIn += usage.in ?? 0; tokensOut += usage.out ?? 0
    } catch (err) {
      // One dead window must not lose the whole deck. Report it and carry on.
      console.error(`  pages ${from}-${to}: FAILED — ${err.message}`)
      continue
    }
    // Enforce the window. The model can see the whole PDF via the file reference, so it can still
    // write about page 20 while claiming page 13 — this narrows the blast radius to the window, it
    // does not eliminate the failure. Spot-checking survivors stays a human step.
    // The excerpt and the layout are stored as one column, because they are one thing: the source
    // material a simulated student is shown. Kept apart in the schema only to stop the layout
    // being dropped (see the schema note).
    for (const q of batch) {
      if (q?.source_layout?.trim()) q.source_excerpt = `${q.source_excerpt ?? ''}\n\nLAYOUT: ${q.source_layout.trim()}`.trim()
    }
    const kept = batch.filter((q) => Number.isInteger(q?.page) && q.page >= from && q.page <= to)
    outOfWindow += batch.length - kept.length
    drafts.push(...kept)
    console.log(`  pages ${String(from).padStart(2)}-${String(to).padStart(2)}: ${kept.length} kept${batch.length - kept.length ? `, ${batch.length - kept.length} out-of-window` : ''}`)
  }
} finally {
  await client.deleteFile(ref)
}

// --- the mandatory guard: nothing reaches the database unvalidated ---
const { passed, rejected } = validateQuestions(drafts)
console.log(`\n${drafts.length} drafts, ${outOfWindow} rejected out-of-window, ${rejected.length} rejected by the validator, ${passed.length} usable.`)
for (const r of rejected) console.log(`  [${r.index}] ${r.rule}: ${r.quote}`)
const dist = answerDistribution(passed)
console.log(`Answer distribution after shuffle: A=${dist[0]} B=${dist[1]} C=${dist[2]} D=${dist[3]}`)
const pages = [...new Set(passed.map((q) => q.page))].sort((a, b) => a - b)
console.log(`Pages covered: ${pages.join(', ') || '(none)'}`)
console.log(`Tokens: ${tokensIn} in, ${tokensOut} out`)

if (outPath) { writeFileSync(outPath, JSON.stringify(passed, null, 2)); console.log(`Wrote ${outPath}`) }
if (dryRun) { console.log('\nDry run — nothing written to the database.'); process.exit(passed.length ? 0 : 2) }
if (!passed.length) { console.error('\nNothing passed; not writing an empty source row.'); process.exit(2) }

// --- upsert ---
// Ids are a content hash of subject+prompt, not an array index. The old stub used
// `${slug}-d${difficulty}-${i}`, so re-running with different output silently overwrote unrelated
// questions. A hash makes re-runs idempotent and non-destructive.
const DB = process.env.DATABASE_URL
if (!DB) die('Missing DATABASE_URL.')
const sql = neon(DB)
const sourceId = createHash('sha256').update(`${subject}::${title}::${pdfBuf.length}`).digest('hex').slice(0, 24)

await sql`
  insert into sources (id, subject, title, filename, checksum, page_count, status)
  values (${sourceId}, ${subject}, ${title}, ${pdfPath.split(/[\\/]/).pop()},
          ${createHash('sha256').update(pdfBuf).digest('hex')}, ${numpages}, 'ready')
  on conflict (id) do update set status = 'ready', page_count = excluded.page_count
`

let written = 0
for (const q of passed) {
  const id = createHash('sha256').update(`${subject}::${q.prompt}`).digest('hex').slice(0, 32)
  // `recipe` groups items generated the same way so facility can be pooled across a family —
  // per-item calibration cannot converge on ~20 responses, recipe-level can (PROJECT_MAP §2.6).
  const recipe = `mcq/${q.cognitive_level}/window${windowSize}`
  await sql`
    insert into content_items (
      id, source_id, subject, topic, page, kind, cognitive_level, recipe,
      generator_model, stem, options, answer, source_excerpt
    ) values (
      ${id}, ${sourceId}, ${subject}, ${q.topic ?? null}, ${q.page}, 'mcq', ${q.cognitive_level}, ${recipe},
      ${`${client.provider}/${client.model}`}, ${q.prompt}, ${JSON.stringify(q.options)}::jsonb, ${q.answer},
      ${q.source_excerpt ?? null}
    )
    on conflict (id) do update set
      topic = excluded.topic, page = excluded.page, cognitive_level = excluded.cognitive_level,
      recipe = excluded.recipe, generator_model = excluded.generator_model, stem = excluded.stem,
      options = excluded.options, answer = excluded.answer, source_excerpt = excluded.source_excerpt
  `
  written++
}
// simulated_p is deliberately NOT set here. Difficulty is seeded by a separate simulation pass and
// must carry its model and method with it (db/005), because the value is simulator-specific.
console.log(`\nUpserted ${written} items into content_items (source "${title}", subject "${subject}").`)
console.log('Difficulty is unset — run the simulation pass to seed simulated_p.')
