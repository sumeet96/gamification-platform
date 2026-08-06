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
// RESTRUCTURED 6 Aug 2026 INTO TWO STAGES, exactly as generate-terms.mjs was on 3 Aug, and for the
// same reason. The old flow asked one call per window to find the material AND write `--per-window`
// questions from it, under a quota. A quota manufactures garbage: a page of charts still has to
// yield N questions, so it yields N questions about the chart. That is visibly what happened to the
// bank this replaces, which contains "Which team member has a background in computer science from
// Harvard", "What is the commission percentage taken on each transaction" and "Based on the cartoon,
// what is the implied reason for having an elevator pitch" — slide data points wearing the clothes
// of concepts.
//
// Crucially the gap screen CANNOT catch that class. Those questions are perfectly answerable from
// their own source excerpt, so they sail through the grounded arm; the screen only detects items the
// source fails to support. The defect has to be prevented at generation, and three separate attempts
// at catching this family with rules on the output failed during the G2 rebuild. Only the structural
// fix worked: ask what the deck TEACHES first, with no quota and empty as a valid answer, then write
// one question per concept it named. `--per-window` is therefore deleted, not defaulted lower.
//
// Usage:
//   node scripts/generate-questions.mjs <deck.pdf> --subject "Digital Transformation" [options]
//
// Options:
//   --title "Session 12"     human title for the `sources` row (default: filename)
//   --provider openai|gemini default openai
//   --model <id>             default gpt-5-nano on openai; Gemini requires GEMINI_MODEL
//   --window N               pages per call (default 3)
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
const outPath = flag('--out')
const dryRun = process.argv.includes('--dry-run')
if (!Number.isInteger(windowSize) || windowSize < 1) die('--window must be a positive integer.')
if (process.argv.includes('--per-window')) {
  die('--per-window is gone. It was the quota that manufactured chart-caption questions; see the header.')
}

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

// gpt-5-nano is the default on openai for this script only (the adapter's own default stays
// gpt-4.1-mini, so generate-terms.mjs is unaffected). It is a reasoning model, which is what stage 2
// wants — writing four options where exactly one is defensible is a reasoning task, not a
// transcription one — and at $0.05/1M in it is the cheapest tier available. It samples at
// temperature 1 and will not accept another value; llm-client.mjs omits the field for gpt-5*.
const client = createClient(provider, {
  model: flag('--model') || (provider === 'openai' ? 'gpt-5-nano' : null),
})

// --- stage 1 schema: what does this deck teach? ---
const GLOSSARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['concepts'],
  properties: {
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['term', 'gloss', 'page'],
        properties: {
          term: { type: 'string' },
          gloss: { type: 'string' },
          page: { type: 'integer' },
        },
      },
    },
  },
}

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

// --- stage 1: concept glossary, no quota. Carried over near-verbatim from generate-terms.mjs,
// which is the proven version of this prompt; the disqualifying test and the named forbidden
// examples are what stop slide titles and data points becoming "concepts". ---
const glossaryPromptFor = (from, to) => `You are building a CONCEPT GLOSSARY from a university lecture slide deck, for pages ${from} to ${to} only. Ignore every other page.

A concept is something with a definition that stands on its own — independent of any particular number, company, person, or year — that a student could be asked about in a context this deck never showed. A good disqualifying test: if stating the definition requires naming a specific company, person, country, or year, it is a DATA POINT, not a concept.

Explicitly EXCLUDE: chart titles, exhibit captions, data points, company names, people's names, job titles, team rosters, prices, percentages, and section headings. "Netflix Subscribers Statistics 2025", "the commission percentage on each transaction" and "Session 6 Agenda" are captions and data lifted from a slide, not concepts — do not list them.

Do not list two concepts that are near-synonyms or that would share a definition. Merge them into one entry and keep whichever name the material actually uses.

There is NO required count and no target to hit. Return as many concepts as these pages genuinely teach — that may be zero, for a title page, a divider, a team slide, or a slide that is purely a chart or a cartoon. Returning an empty list is a CORRECT answer. Do not invent a concept to avoid an empty list, and do not pad the list to reach any particular number.

For each concept you DO list, give:
- "term": the concept's name, at most 5 words, taken from or clearly named in the material.
- "gloss": one line stating what it means, on its own, without naming a specific company/person/year.
- "page": the single page (between ${from} and ${to}) it comes from.`

// --- stage 2: one question per glossary concept. One concept in, one question out, so there is no
// quota anywhere in this flow — if stage 1 returned nothing for a window, stage 2 is never called. ---
const questionPromptFor = (from, to, concepts) => `You previously helped build a concept glossary from this lecture slide deck. Now write ONE multiple-choice question for EACH of the following ${concepts.length} concept(s), all already confirmed to come from pages ${from}-${to} of this PDF:

${concepts.map((c, i) => `${i + 1}. "${c.term}" — ${c.gloss} (page ${c.page})`).join('\n')}

Write exactly ${concepts.length} question(s), one per concept, in that order. Each question must test the CONCEPT — something a student could be asked in a context this deck never showed. It must NOT test a number, a name, a job title, a price, or anything else true only of this particular slide.

For each one:
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
- ALL FOUR OPTIONS MUST BE CLOSE TO THE SAME LENGTH — within a few words of each other. Do not
  write a full, careful, qualified sentence for the correct answer and short blunt phrases for the
  wrong ones. That is the single most common way a multiple-choice item leaks its answer: a student
  who knows nothing can score well by always choosing the longest option. If the correct answer
  needs a qualification to be true, give the distractors comparable qualifications. Count the words
  in each option before you return them and even them out.
- EXACTLY ONE option may be defensible. If two options are both true, the question is broken —
  rewrite it. On a diagram, check that no other item shares the same region as the correct answer.
- Prefer apply, discriminate or deduce over pure "recall" wherever the concept supports it. If a
  concept genuinely only supports recall, write a recall question rather than inventing content to
  reach a level.
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

let concepts = 0, emptyWindows = 0

try {
  for (let from = firstPage; from <= lastPage; from += windowSize) {
    const to = Math.min(from + windowSize - 1, lastPage)

    // ---- stage 1: what does this window teach? ----
    let windowConcepts = []
    try {
      const { data, usage } = await client.generateJSON({ ref, prompt: glossaryPromptFor(from, to), schema: GLOSSARY_SCHEMA })
      tokensIn += usage.in ?? 0; tokensOut += usage.out ?? 0
      // Same window guard as stage 2 below: the model can see the whole PDF via the file
      // reference, so a concept can claim a page it did not come from.
      windowConcepts = (data?.concepts ?? []).filter((c) => Number.isInteger(c?.page) && c.page >= from && c.page <= to)
    } catch (err) {
      console.error(`  [glossary] pages ${from}-${to}: FAILED — ${err.message}`)
      continue
    }
    concepts += windowConcepts.length
    if (!windowConcepts.length) {
      // The whole point of the rebuild: an empty window is a CORRECT answer, not a failure to
      // retry or pad. A title page or a cartoon teaches nothing and must yield nothing.
      emptyWindows++
      console.log(`  pages ${String(from).padStart(2)}-${String(to).padStart(2)}: 0 concepts, no questions`)
      continue
    }

    // ---- stage 2: one question per concept ----
    let batch = []
    try {
      const { data, usage } = await client.generateJSON({ ref, prompt: questionPromptFor(from, to, windowConcepts), schema: SCHEMA })
      batch = Array.isArray(data?.questions) ? data.questions : []
      tokensIn += usage.in ?? 0; tokensOut += usage.out ?? 0
    } catch (err) {
      // One dead window must not lose the whole deck. Report it and carry on.
      console.error(`  [items] pages ${from}-${to}: FAILED — ${err.message}`)
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
    console.log(`  pages ${String(from).padStart(2)}-${String(to).padStart(2)}: ${windowConcepts.length} concept(s) -> ${kept.length} kept${batch.length - kept.length ? `, ${batch.length - kept.length} out-of-window` : ''}`)
  }
} finally {
  await client.deleteFile(ref)
}

// --- the mandatory guard: nothing reaches the database unvalidated ---
const { passed, rejected } = validateQuestions(drafts)
console.log(`\n${concepts} concept(s) found across ${emptyWindows} empty window(s) skipped; ${drafts.length} drafts, ` +
  `${outOfWindow} rejected out-of-window, ${rejected.length} rejected by the validator, ${passed.length} usable.`)
for (const r of rejected) console.log(`  [${r.index}] ${r.rule}: ${r.quote}`)
const dist = answerDistribution(passed)
console.log(`Answer distribution after shuffle: A=${dist[0]} B=${dist[1]} C=${dist[2]} D=${dist[3]}`)

// LENGTH GIVEAWAY, reported per run and never used to reject. Measured 6 Aug 2026: the live bank of
// 17 (gpt-4.1-mini, old single-stage flow) has the correct option longest on 11 of 17 = 65%, and a
// first gpt-5-nano run hit 86%, against a 25% chance baseline. A student who knows nothing scores
// near that rate by always picking the longest option, so the item measures test-wiseness rather
// than knowledge -- and the difficulty calibrator's simulated students exploit exactly the same cue,
// which inflates simulated_p and is a candidate explanation for the ceiling that leaves band 1 empty.
//
// Reported, not enforced: the existing option-length-balance rule already rejects on spread, and
// stacking a second length rule on top risks the over-rejecting-validator failure that once cost G2
// five of eight good items. This makes the problem visible every run so a bad batch is caught by a
// human before import; the real fix is the prompt rule above.
const longestIsAnswer = passed.filter((q) => {
  const lens = q.options.map((o) => String(o).length)
  return lens[q.answer] === Math.max(...lens)
}).length
if (passed.length) {
  const pct = Math.round((longestIsAnswer / passed.length) * 100)
  console.log(`Length giveaway: correct option is the longest in ${longestIsAnswer}/${passed.length} (${pct}%) — chance is 25%` +
    (pct > 45 ? '  <-- TOO HIGH, these items leak their answer' : ''))
}
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
