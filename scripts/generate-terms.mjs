#!/usr/bin/env node
// Package G2 — generate term_definition primitives from a slide/case PDF and write them to
// `content_items`. Unblocks match-the-following, fill-in-the-blanks, choose-the-right-word and
// Wordle, which today have zero rows to read (17 `mcq` rows, 0 `term_definition` rows).
//
// Restructured 2-3 Aug 2026 into TWO stages, replacing the original single-call-per-window flow.
// The old flow asked one call to find a concept, define it, AND invent wrong answers, under a
// quota ("Write ${perWindow} items"). On a 9-page chart-heavy sample that produced 6 drafts, 3 of
// them chart captions the prompt explicitly forbade and named as examples — the quota pressure
// pushed the model to pad with whatever was nearby, and a caption has no real "siblings" to draw
// wrong answers from, so its distractors were just other captions.
//
// Stage 1 (glossaryPromptFor) asks ONLY "what concepts does this deck teach?", no quota — an
// empty list is a correct answer for a page that teaches nothing. Stage 2 (itemFieldsPromptFor)
// writes the full item fields for each glossary concept, GROUNDED to it, INCLUDING its
// distractors, so the model is never asked to both find and define in one breath but IS asked to
// invent the wrong answers alongside the right one.
//
// REVERSED 3 Aug 2026: distractors used to be selected IN CODE from the glossary
// (scripts/lib/distractor-select.mjs), on the theory that a real sibling concept beats an
// invention. A verified 18-page dry run disproved that: 2 of 3 items came out unanswerable
// because the glossary held a near-synonym pair ("Globalization Journey" / "Global Footprint")
// that each picked as the other's distractor, and each clue described both. The one good item's
// distractors came from the REPAIR path, which invents them under explicit constraints (near
// miss, never a synonym, share the term's head noun) — genuinely confusable, none accidentally
// correct. Invention constrained by rules beats selection from a glossary that can contain
// near-synonyms. `distractor-select.mjs` and its tests are deleted, not parked — nothing else
// imported them. The item call now writes distractors directly, under the same constraints the
// repair prompt already proved out; the separate per-item sanity-check call is gone with it, so
// generation is back to one call per item, not two. The repair path (below, unchanged) stays as
// the backstop for the option-set-giveaway defect, which is a different failure mode (a shared
// clue/term token with no covering distractor) that writing distractors well does not by itself
// prevent.
//
// Still mirrors scripts/generate-questions.mjs: same window loop shape, same out-of-window
// rejection, same mandatory-validator guard, same content-hash ids, same source_excerpt/
// source_layout split. What differs is the shape being generated and the validator, since a
// term_definition item is broken by leaking its own answer (into the clue or the example
// sentence) rather than by a bad answer index.
//
// Usage:
//   node scripts/generate-terms.mjs <deck.pdf> --subject "Digital Transformation" [options]
//
// Options:
//   --title "Session 12"     human title for the `sources` row (default: filename)
//   --provider openai|gemini default openai (Gemini credits depleted — see CLAUDE.md)
//   --model <id>             default per provider; Gemini requires GEMINI_MODEL
//   --window N                pages per call, used for BOTH stages (default 12 — "large windows,
//                              or whole deck if it fits", per the brief; a typical ~20-30 page
//                              deck needs only one or two glossary calls)
//   --pages A-B               only this page range, e.g. 1-6 (default: whole deck)
//   --out <file.json>         write the validated set to disk
//   --dry-run                 generate and validate, write nothing to the database
//
// --per-window is GONE: stage 1 has no quota to size, so "terms requested per window" no longer
// means anything. If a future stage needs a per-call cap again, it should be a MAXIMUM with
// "fewer is correct" stated explicitly, per the brief — not resurrected as a target.

import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { loadEnv, createClient } from './lib/llm-client.mjs'
import { validateTerms, revalidateItem } from './lib/terms-validate.mjs'
import { sanitizeExampleSentences } from './lib/terms-example-sanitize.mjs'

loadEnv()

const USAGE = 'Usage: node scripts/generate-terms.mjs <deck.pdf> --subject "Name" [--title T] [--provider openai|gemini] [--model M] [--window 12] [--pages A-B] [--out f.json] [--dry-run]'
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
const windowSize = Number(flag('--window', 12))
const outPath = flag('--out')
const dryRun = process.argv.includes('--dry-run')
if (!Number.isInteger(windowSize) || windowSize < 1) die('--window must be a positive integer.')

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

// A term recapped on a later page ("Cultural Adaptation" on page 3, "cultural adaptation" again on
// page 9) must collide in the dedup Set even though the model's casing/whitespace/article choice
// varies call to call. Lowercase + trim + collapse internal whitespace + drop one leading article —
// deliberately not a full normaliser (no stemming, no synonym folding): this only needs to catch the
// same concept restated, not decide two different concepts are the same one.
const normaliseGlossaryKey = (term) =>
  term.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^(the|an?)\s+/, '')

// --- schemas ---
// Strict JSON Schema. Constrained decoding guarantees SHAPE, not TRUTH — it cannot know a clue
// leaks its own term or a page number is a lie, so terms-validate.mjs still runs on everything.

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

// `distractors` is back on this schema — reversed 3 Aug 2026, see the header comment. The model
// writes the wrong answers in the same call as the right one, under the constraints spelled out
// in itemFieldsPromptFor.
const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
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

// --- stage 1: concept glossary, no quota ---
const glossaryPromptFor = (from, to) => `You are building a CONCEPT GLOSSARY from a university lecture slide deck, for pages ${from} to ${to} only. Ignore every other page.

A concept is something with a definition that stands on its own — independent of any particular number, company, country, or year — that a student could be asked about in a context this deck never showed. A good disqualifying test: if stating the definition requires naming a specific company, country, or year, it is a DATA POINT, not a concept.

Explicitly EXCLUDE: chart titles, exhibit captions, data points, company names, country names, and section headings. "Netflix Subscribers Statistics 2025", "Mattel Japan Market Share" and "Session 6 Agenda" are captions and headings lifted from a slide title, not concepts — do not list them.

Do not list two concepts that are near-synonyms or that would share a definition — e.g. one concept describing a company's expansion into multiple countries and another describing its resulting geographic spread are the same idea twice. Merge them into one entry and keep whichever name the material actually uses. This matters beyond tidiness: two near-synonym concepts later become an MCQ's correct answer and its own distractor, which makes the item unanswerable.

There is NO required count and no target to hit. Return as many concepts as these pages genuinely teach — that may be zero, for a title page, a divider, or a slide that is purely a chart or case data. Returning an empty list is a CORRECT answer. Do not invent a concept to avoid an empty list, and do not pad the list to reach any particular number.

For each concept you DO list, give:
- "term": the concept's name, at most 5 words, taken from or clearly named in the material.
- "gloss": one line stating what it means, on its own, without naming a specific company/country/year.
- "page": the single page (between ${from} and ${to}) it comes from.`

// --- stage 2: item fields (including distractors) for each glossary concept, grounded and quota-free (one concept in, one item out) ---
const itemFieldsPromptFor = (from, to, concepts) => `You previously helped build a concept glossary for this deck. Now write a full study item for EACH of the following ${concepts.length} concept(s), all already confirmed to come from pages ${from}-${to} of this PDF:

${concepts.map((c, i) => `${i + 1}. "${c.term}" — ${c.gloss} (page ${c.page})`).join('\n')}

Return exactly one item per concept above, in the same order, and echo the "term" field back EXACTLY as given — do not reword it.

Each item you write feeds FOUR different games at once: a crossword clue, a match-the-following pairing, a fill-in-the-blanks sentence, and a Wordle hint. For each concept:
- "term": copy verbatim from the list above.
- "clue": a definition or description of the term, usable as a crossword clue, a match-the-following target, and a Wordle hint. It must define the CONCEPT, not describe an exhibit — a clue that reports a statistic, a ranking, or a year is a caption in disguise (bad example: "Percentage share of the search engine market worldwide, as of September 2025"). It must NOT contain the term itself, or any obvious variant of it (e.g. if the term is "automation", the clue may not contain "automate" or "automating" either) — that would hand every one of those games its own answer. It also must not contain a detail (a country, a year, a proper noun) that would let a student answer on that one word alone, without knowing the material.
- "example_sentence": a sentence from or faithful to the source material that CONTAINS the term verbatim. This is what a fill-in-the-blanks game blanks out. Use null if no such sentence exists on these pages — do not invent one that misrepresents the source.
- "variants": other acceptable answers for the term — abbreviations, plurals, common alternate spellings. Empty array if there are none.
- "distractors": exactly 3 wrong-answer options for a multiple-choice rendering of this item. Each must be plausible but WRONG — a near miss, never a synonym of the term. If a student who knows the material could reasonably argue a distractor is also correct, it is not a valid distractor; discard it and write a different one. Where the term has a natural head noun, SHARE it across the distractor set rather than avoiding it (term "Story Wall" -> distractors like "Release Wall", "Story Board") — that is what stops a distractor set from giving the answer away by elimination on a shared word. Never reuse the term itself, or an obvious inflection of it, as a distractor.
- "page": the single page this concept comes from. It MUST be between ${from} and ${to}.
- "source_excerpt": the words on that page, transcribed verbatim, including words inside images.
- "source_layout": if the page is a diagram, chart, matrix or quadrant, describe where things sit — what each axis means, which end is which, and which items fall in which quadrant or region. If the page has no meaningful spatial arrangement, use an empty string.
- "cognitive_level": what engaging with this term demands. "recall" = remember a stated fact. "apply" = use a definition on a new instance. "discriminate" = tell two similar concepts apart. "deduce" = infer from incomplete information. "transfer" = apply to a case not in the material.
- "topic": a short topic label for this concept within the subject.

Hard rules:
- The clue must stand alone. NEVER refer to "the slide", "the deck", "the diagram above" or the presentation itself.
- Base every item strictly on pages ${from}-${to}. Do not use outside knowledge.`

// --- distractor repair (kept, unchanged) ---
// checkOptionSetGiveaway (terms-validate.mjs) fires when a clue shares a content word with the
// term and NO distractor carries that same word — a student can then pick the answer by keyword
// alone. Rejecting the whole item for that is what CLAUDE.md's "over-rejecting guard" incident
// warned against: the giveaway lives in the DISTRACTOR SET, not the term or clue, and is fixable
// by rewriting distractors rather than throwing the item away. This still fires even though stage
// 2 now writes distractors under the same head-noun-sharing rule this repair prompt states below —
// the item call optimises per-item, with no visibility into which glossary token the VALIDATOR
// will later flag, so a giveaway can still slip through and still needs this mandatory backstop.
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

console.log(`${title}: ${numpages} pages, generating over ${firstPage}-${lastPage} in windows of ${windowSize} on ${client.provider}/${client.model}${dryRun ? ' (dry run)' : ''}`)
const ref = await client.uploadPdf(pdfPath)

let tokensIn = 0, tokensOut = 0
let glossaryOutOfWindow = 0, glossaryDupes = 0
let itemOutOfWindow = 0, itemOffGlossary = 0
let exampleNulledLength = 0, exampleNulledMissingTerm = 0

// Declared outside the try so they survive to the reporting section below; the repair loop needs
// `ref` (the uploaded PDF reference), which is only alive until the `finally` deletes it.
let passed, rejected, repaired = [], repairFailed = []
let glossary = [], drafts = []

try {
  // ---- stage 1: glossary ----
  const glossaryRaw = []
  for (let from = firstPage; from <= lastPage; from += windowSize) {
    const to = Math.min(from + windowSize - 1, lastPage)
    let batch = []
    try {
      const { data, usage } = await client.generateJSON({ ref, prompt: glossaryPromptFor(from, to), schema: GLOSSARY_SCHEMA })
      batch = Array.isArray(data?.concepts) ? data.concepts : []
      tokensIn += usage.in ?? 0; tokensOut += usage.out ?? 0
    } catch (err) {
      console.error(`  [glossary] pages ${from}-${to}: FAILED — ${err.message}`)
      continue
    }
    const kept = batch.filter((c) => Number.isInteger(c?.page) && c.page >= from && c.page <= to && typeof c?.term === 'string' && c.term.trim())
    glossaryOutOfWindow += batch.length - kept.length
    glossaryRaw.push(...kept)
    console.log(`  [glossary] pages ${String(from).padStart(2)}-${String(to).padStart(2)}: ${kept.length} concept(s)${batch.length - kept.length ? `, ${batch.length - kept.length} out-of-window` : ''}`)
  }
  const seenGlossaryTerms = new Set()
  for (const c of glossaryRaw) {
    const key = normaliseGlossaryKey(c.term)
    if (seenGlossaryTerms.has(key)) { glossaryDupes++; continue }
    seenGlossaryTerms.add(key)
    glossary.push(c)
  }
  console.log(`\nGlossary: ${glossary.length} concept(s)${glossaryDupes ? ` (${glossaryDupes} duplicate term(s) dropped)` : ''}.`)
  // With no quota, this list is the number that tells us whether a deck is worth mining at all —
  // print it in full rather than leaving it implied by the eventual item count.
  for (const c of glossary) console.log(`  - ${c.term} (page ${c.page})`)

  // ---- stage 2a: item fields, grounded per concept, batched by the same windows ----
  for (let from = firstPage; from <= lastPage; from += windowSize) {
    const to = Math.min(from + windowSize - 1, lastPage)
    const windowConcepts = glossary.filter((c) => c.page >= from && c.page <= to)
    if (!windowConcepts.length) {
      console.log(`  [items] pages ${String(from).padStart(2)}-${String(to).padStart(2)}: 0 glossary concepts, skipping`)
      continue
    }
    let batch = []
    try {
      const { data, usage } = await client.generateJSON({ ref, prompt: itemFieldsPromptFor(from, to, windowConcepts), schema: ITEM_SCHEMA })
      batch = Array.isArray(data?.items) ? data.items : []
      tokensIn += usage.in ?? 0; tokensOut += usage.out ?? 0
    } catch (err) {
      console.error(`  [items] pages ${from}-${to}: FAILED — ${err.message}`)
      continue
    }
    for (const t of batch) {
      if (t?.source_layout?.trim()) t.source_excerpt = `${t.source_excerpt ?? ''}\n\nLAYOUT: ${t.source_layout.trim()}`.trim()
    }
    const conceptKeys = new Set(windowConcepts.map((c) => c.term.trim().toLowerCase()))
    const kept = []
    for (const t of batch) {
      if (!Number.isInteger(t?.page) || t.page < from || t.page > to) { itemOutOfWindow++; continue }
      if (typeof t?.term !== 'string' || !conceptKeys.has(t.term.trim().toLowerCase())) { itemOffGlossary++; continue }
      kept.push(t)
    }
    drafts.push(...kept)
    const rejectedNote = []
    if (batch.length - kept.length) rejectedNote.push(`${batch.length - kept.length} rejected`)
    console.log(`  [items] pages ${String(from).padStart(2)}-${String(to).padStart(2)}: ${windowConcepts.length} concept(s) -> ${kept.length} item(s)${rejectedNote.length ? `, ${rejectedNote}` : ''}`)
  }

  // example_sentence is fed only to fill-in-the-blanks (not yet built) — null a doomed one BEFORE
  // the mandatory validator runs so example-missing-term (and an unblankable multi-line dump)
  // nulls the field instead of destroying the whole item. See lib/terms-example-sanitize.mjs.
  // Nulling first, not after, is what lets a genuine SECOND defect on the same item (checked by a
  // later rule in terms-validate.mjs's ordered pipeline) still reject it, per the brief.
  ;({ nulledForLength: exampleNulledLength, nulledForMissingTerm: exampleNulledMissingTerm } =
    sanitizeExampleSentences(drafts))

  // --- the mandatory guard: nothing reaches the database unvalidated ---
  // Distractors already live on each draft — stage 2 wrote them alongside the rest of the item's
  // fields (see the header comment for why the separate selection+sanity-check stage was removed).
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

console.log(`\n${drafts.length} drafts (from ${glossary.length} glossary concepts), ` +
  `${glossaryOutOfWindow} glossary entries rejected out-of-window, ${itemOutOfWindow} items rejected out-of-window, ` +
  `${itemOffGlossary} items rejected as off-glossary drift, ${rejected.length} rejected by the validator ` +
  `(${repairFailed.length} of those after a failed distractor repair), ${repaired.length} repaired and kept, ${passed.length} usable.`)
if (exampleNulledMissingTerm) console.log(`${exampleNulledMissingTerm} item(s) kept with example_sentence nulled (no verbatim sentence found).`)
if (exampleNulledLength) console.log(`${exampleNulledLength} item(s) kept with example_sentence nulled (not a single sentence — multi-line or over 220 chars).`)
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
  const id = t.id ?? createHash('sha256').update(`${subject}::${t.term}`).digest('hex').slice(0, 32)
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
