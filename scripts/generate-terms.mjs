#!/usr/bin/env node
// Package G2 — generate term_definition primitives from a slide/case PDF and write them to
// `content_items`. Unblocks match-the-following, fill-in-the-blanks, choose-the-right-word and
// Wordle, which today have zero rows to read (17 `mcq` rows, 0 `term_definition` rows).
//
// Closely mirrors scripts/generate-questions.mjs: same window loop, same out-of-window rejection,
// same mandatory-validator guard, same content-hash ids, same source_excerpt/source_layout split.
// What differs is the shape being generated and the validator, since a term_definition item is
// broken by leaking its own answer (into the clue or the example sentence) rather than by a bad
// answer index.
//
// Usage:
//   node scripts/generate-terms.mjs <deck.pdf> --subject "Digital Transformation" [options]
//
// Options:
//   --title "Session 12"     human title for the `sources` row (default: filename)
//   --provider openai|gemini default openai (Gemini credits depleted — see CLAUDE.md)
//   --model <id>             default per provider; Gemini requires GEMINI_MODEL
//   --window N               pages per call (default 3)
//   --per-window K           terms requested per window (default 2)
//   --pages A-B              only this page range, e.g. 1-6 (default: whole deck)
//   --out <file.json>        write the validated set to disk
//   --dry-run                generate and validate, write nothing to the database

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { loadEnv, createClient } from './lib/llm-client.mjs'
import { validateTerms, revalidateItem } from './lib/terms-validate.mjs'

loadEnv()

const USAGE = 'Usage: node scripts/generate-terms.mjs <deck.pdf> --subject "Name" [--title T] [--provider openai|gemini] [--model M] [--window 3] [--per-window 2] [--pages A-B] [--out f.json] [--dry-run]'
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

// Strict JSON Schema. Constrained decoding guarantees SHAPE, not TRUTH — it cannot know a clue
// leaks its own term or a page number is a lie, so terms-validate.mjs still runs on everything.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['terms'],
  properties: {
    terms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['topic', 'cognitive_level', 'term', 'clue', 'example_sentence', 'variants', 'distractors', 'page', 'source_excerpt', 'source_layout'],
        properties: {
          topic: { type: 'string' },
          cognitive_level: { type: 'string', enum: ['recall', 'apply', 'discriminate', 'deduce', 'transfer'] },
          term: { type: 'string' },
          clue: { type: 'string' },
          // Nullable, not optional — the schema wants an explicit signal rather than a dropped key.
          example_sentence: { type: ['string', 'null'] },
          variants: { type: 'array', items: { type: 'string' } },
          distractors: { type: 'array', items: { type: 'string' } },
          page: { type: 'integer' },
          source_excerpt: { type: 'string' },
          source_layout: { type: 'string' },
        },
      },
    },
  },
}

const promptFor = (from, to) => `You are extracting term/definition study primitives from a lecture slide deck for university students. Each item you write feeds FOUR different games at once: a crossword clue, a match-the-following pairing, a fill-in-the-blanks sentence, and a Wordle hint. Every field has a specific job — do not skip or shortcut any of them.

Use ONLY pages ${from} to ${to} of this PDF. Ignore every other page completely.

Write ${perWindow} term/definition items. For each one:
- "term": the thing being learned — a word or short phrase (at most 5 words), taken from or clearly named in the material. It must be a CONCEPT a student could learn and reuse, not a chart or exhibit caption. If a slide's title is "Netflix Subscribers Statistics 2025" or "Mattel Japan Market Share", do not lift that title as the term — either skip the slide or name the underlying concept it illustrates instead. A term that is mostly a country, a year, or a metric word ("Market Share", "Statistics", "Subscribers") is almost always a caption, not a concept.
- "clue": a definition or description of the term, usable as a crossword clue, a match-the-following target, and a Wordle hint. It must NOT contain the term itself, or any obvious variant of it (e.g. if the term is "automation", the clue may not contain "automate" or "automating" either) — that would hand every one of those games its own answer. It also must not contain a detail (a country, a year, a proper noun) that appears in the correct term but in NONE of the distractors — a student could answer on that one word alone without knowing the material, even if the clue never uses the term's own words.
- "example_sentence": a sentence from or faithful to the source material that CONTAINS the term verbatim. This is what a fill-in-the-blanks game blanks out. If no such sentence exists on these pages, use null rather than inventing one that misrepresents the source.
- "variants": other acceptable answers for the term — abbreviations, plurals, common alternate spellings. Return an empty array if there are none.
- "distractors": 2-4 other terms that are plausible but WRONG matches for this clue — near misses, not synonyms of the term (a synonym would make the item unanswerable, since it would also be correct). Where the term has a natural head noun, share it across the distractor set rather than avoiding it — "Story Wall" -> "Release Wall", "Story Board"; "User story cards" -> "Task cards", "Index cards"; "Minimum Viable Product" -> "Minimum Marketable Feature", "Product Increment". A clue almost always has to use that same head noun to define the term at all, and if only the correct answer carries it, a student can pick it out by keyword alone without knowing the material. Return an empty array only if the material genuinely offers nothing suitable.
- "page": the single page the term comes from. It MUST be between ${from} and ${to}.
- "source_excerpt": the words on that page, transcribed verbatim, including words inside images.
- "source_layout": if the page is a diagram, chart, matrix or quadrant, describe where things sit — what each axis means, which end is which, and which items fall in which quadrant or region. If the page has no meaningful spatial arrangement, use an empty string.
- "cognitive_level": what engaging with this term demands. "recall" = remember a stated fact. "apply" = use a definition on a new instance. "discriminate" = tell two similar concepts apart. "deduce" = infer from incomplete information. "transfer" = apply to a case not in the material.

Hard rules:
- The clue must stand alone. NEVER refer to "the slide", "the deck", "the diagram above" or the presentation itself.
- Do not pick two items whose terms are near-duplicates of each other within this window.
- Base every item strictly on pages ${from} to ${to}. Do not use outside knowledge.
- If these pages are a title page, a divider, or otherwise carry no teachable terminology, return an empty terms array. Do not invent content to fill the quota.`

// --- distractor repair ---
// checkOptionSetGiveaway (terms-validate.mjs) fires when a clue shares a content word with the
// term and NO distractor carries that same word — a student can then pick the answer by keyword
// alone. Rejecting the whole item for that is what CLAUDE.md's "over-rejecting guard" incident
// warned against: the giveaway lives in the DISTRACTOR SET, not the term or clue, and is fixable
// by rewriting distractors rather than throwing the item away. One extra call per repairable item,
// no loop — cost discipline, not because a second retry couldn't also work.
const REPAIR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['distractors'],
  properties: { distractors: { type: 'array', items: { type: 'string' } } },
}
const repairPromptFor = (item, token) => `You previously wrote this term/definition study item, but its distractor set has a defect: the clue and the correct term both contain "${token}", and NONE of the current distractors do. That means a student can pick the correct answer just by spotting "${token}" among the options, without knowing the material.

Term: "${item.term}"
Clue: "${item.clue}"
Current distractors: ${JSON.stringify(item.distractors)}

Write a REPLACEMENT set of ${item.distractors.length} distractors for this same term and clue.
- At least one new distractor MUST also contain "${token}" (or an obvious inflection of it), so that word alone no longer identifies the correct answer.
- Every distractor must stay plausible but WRONG — a near miss, not a synonym of the term (a synonym would make the item unanswerable, since it would also be correct).
- Do not reuse the term itself or any of the current distractors verbatim.`

// --- window loop ---
console.log(`${title}: ${numpages} pages, generating over ${firstPage}-${lastPage} in windows of ${windowSize} on ${client.provider}/${client.model}${dryRun ? ' (dry run)' : ''}`)
const ref = await client.uploadPdf(pdfPath)
const drafts = []
let outOfWindow = 0
let tokensIn = 0, tokensOut = 0

// Declared outside the try so they survive to the reporting section below; the repair loop needs
// `ref` (the uploaded PDF reference), which is only alive until the `finally` deletes it, so both
// validation and repair run inside the try, before that happens.
let passed, rejected, repaired = [], repairFailed = []

try {
  for (let from = firstPage; from <= lastPage; from += windowSize) {
    const to = Math.min(from + windowSize - 1, lastPage)
    let batch = []
    try {
      const { data, usage } = await client.generateJSON({ ref, prompt: promptFor(from, to), schema: SCHEMA })
      batch = Array.isArray(data?.terms) ? data.terms : []
      tokensIn += usage.in ?? 0; tokensOut += usage.out ?? 0
    } catch (err) {
      // One dead window must not lose the whole deck. Report it and carry on.
      console.error(`  pages ${from}-${to}: FAILED — ${err.message}`)
      continue
    }
    // Enforce the window, same as G1: the model can see the whole PDF via the file reference, so
    // it can still write about page 20 while claiming page 13 — this narrows the blast radius to
    // the window, it does not eliminate the failure. Spot-checking survivors stays a human step.
    for (const t of batch) {
      if (t?.source_layout?.trim()) t.source_excerpt = `${t.source_excerpt ?? ''}\n\nLAYOUT: ${t.source_layout.trim()}`.trim()
    }
    const kept = batch.filter((t) => Number.isInteger(t?.page) && t.page >= from && t.page <= to)
    outOfWindow += batch.length - kept.length
    drafts.push(...kept)
    console.log(`  pages ${String(from).padStart(2)}-${String(to).padStart(2)}: ${kept.length} kept${batch.length - kept.length ? `, ${batch.length - kept.length} out-of-window` : ''}`)
  }

  // --- the mandatory guard: nothing reaches the database unvalidated ---
  const validated = validateTerms(drafts)
  rejected = validated.rejected
  passed = validated.passed

  // --- distractor repair: one extra call per item flagged option-set-giveaway, not a loop ---
  for (const r of validated.repairable) {
    const original = drafts[r.index]
    try {
      const { data, usage } = await client.generateJSON({ ref, prompt: repairPromptFor(original, r.token), schema: REPAIR_SCHEMA })
      tokensIn += usage.in ?? 0; tokensOut += usage.out ?? 0
      const candidate = { ...original, distractors: Array.isArray(data?.distractors) ? data.distractors : original.distractors }
      const fail = revalidateItem(candidate)
      if (fail) repairFailed.push({ index: r.index, ...fail })
      else repaired.push(candidate)
    } catch (err) {
      // Same principle as a dead generation window: one failed repair call must not lose the item
      // silently — it falls through to rejected, logged with why.
      repairFailed.push({ index: r.index, rule: 'repair-call-failed', quote: err.message })
    }
  }
  passed = [...passed, ...repaired]
  rejected = [...rejected, ...repairFailed]
} finally {
  await client.deleteFile(ref)
}

console.log(`\n${drafts.length} drafts, ${outOfWindow} rejected out-of-window, ${rejected.length} rejected by the validator ` +
  `(${repairFailed.length} of those after a failed distractor repair), ${repaired.length} repaired and kept, ${passed.length} usable.`)
for (const r of rejected) console.log(`  [${r.index}] ${r.rule}: ${r.quote}`)
for (const t of repaired) console.log(`  [repaired] "${t.term}": new distractors ${JSON.stringify(t.distractors)}`)
const pages = [...new Set(passed.map((t) => t.page))].sort((a, b) => a - b)
console.log(`Pages covered: ${pages.join(', ') || '(none)'}`)
const noDistractors = passed.filter((t) => t.distractors.length === 0).length
if (noDistractors) console.log(`Note: ${noDistractors} item(s) passed with an empty distractors array.`)
// Wordle supply constraint (package A0): single-word terms of 4-8 letters, alphabetic only.
const wordleCandidates = passed.filter((t) => {
  const w = t.term.trim()
  return /^[A-Za-z]+$/.test(w) && w.length >= 4 && w.length <= 8
})
console.log(`Wordle-eligible (single word, 4-8 letters): ${wordleCandidates.length} of ${passed.length} — ${wordleCandidates.map((t) => t.term).join(', ') || '(none)'}`)
console.log(`Tokens: ${tokensIn} in, ${tokensOut} out`)

if (outPath) { writeFileSync(outPath, JSON.stringify(passed, null, 2)); console.log(`Wrote ${outPath}`) }
if (dryRun) { console.log('\nDry run — nothing written to the database.'); process.exit(passed.length ? 0 : 2) }
if (!passed.length) { console.error('\nNothing passed; not writing an empty source row.'); process.exit(2) }

// --- upsert ---
// Ids are a content hash of subject+term, not an array index, so re-running with different output
// is idempotent and non-destructive (same rationale as G1, keyed on term instead of prompt since
// that is the natural unique key for this primitive).
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
for (const t of passed) {
  const id = createHash('sha256').update(`${subject}::${t.term}`).digest('hex').slice(0, 32)
  // `recipe` groups items generated the same way so facility can be pooled across a family —
  // per-item calibration cannot converge on ~20 responses, recipe-level can (PROJECT_MAP §2.6).
  const recipe = `term_definition/${t.cognitive_level}/window${windowSize}`
  await sql`
    insert into content_items (
      id, source_id, subject, topic, page, kind, cognitive_level, recipe,
      generator_model, term, clue, example_sentence, variants, distractors, source_excerpt
    ) values (
      ${id}, ${sourceId}, ${subject}, ${t.topic ?? null}, ${t.page}, 'term_definition', ${t.cognitive_level}, ${recipe},
      ${`${client.provider}/${client.model}`}, ${t.term}, ${t.clue}, ${t.example_sentence ?? null},
      ${JSON.stringify(t.variants)}::jsonb, ${JSON.stringify(t.distractors)}::jsonb, ${t.source_excerpt ?? null}
    )
    on conflict (id) do update set
      topic = excluded.topic, page = excluded.page, cognitive_level = excluded.cognitive_level,
      recipe = excluded.recipe, generator_model = excluded.generator_model, clue = excluded.clue,
      example_sentence = excluded.example_sentence, variants = excluded.variants,
      distractors = excluded.distractors, source_excerpt = excluded.source_excerpt
  `
  written++
}
// difficulty and simulated_p are deliberately NOT set here — calibration is a separate pass and
// must carry its own model and method with it (CLAUDE.md, db/005).
console.log(`\nUpserted ${written} items into content_items (source "${title}", subject "${subject}").`)
