#!/usr/bin/env node
// SPIKE (5 Aug 2026) — does the term bank's 9-cell floor come from the DECK or from the PROMPT?
//
// Every one of the 136 domain strings in the live bank (34 terms + 102 distractors) is >= 9 letters
// once spaces/punctuation are stripped, and only one is a single word. That kills every
// letter-constrained game (crossword, Wordle, Strands, the Mini): a crossword needs short entries as
// connective tissue, and a working example we compared against had 6 of 22 entries at <= 8 cells.
//
// Two readings, and they have opposite consequences:
//   SIZE  — two sample decks is a small sample; more course material would surface short terms.
//   SHAPE — management pedagogy names things phrasally, so more decks give more of the same.
// Only SHAPE kills the crossword. This spike separates them.
//
// It runs stage 1 (the glossary pass) TWICE over identical pages, changing exactly one thing:
//   arm A (control) — the production glossary prompt, verbatim from generate-terms.mjs
//   arm B (short)   — the same prompt plus a paragraph removing a possible omission bias against
//                     short/single-word canonical names
//
// The arm B paragraph deliberately does NOT name example terms (naming "Scrum"/"Kanban" would prime
// the model to emit them and contaminate the result) and explicitly forbids inventing, truncating or
// initialising a short name for a phrasally-named concept — otherwise this reproduces the quota
// failure the two-stage generator exists to prevent: pressure to hit a shape manufactures garbage.
//
// Writes to nothing. Prints a length histogram per arm and dumps JSON to --out.
//
// Usage:
//   node scripts/spike-short-terms.mjs <deck.pdf> [--pages A-B] [--window 12]
//        [--provider openai] [--model M] [--out spike-data/short-terms.json]

import { readFileSync, writeFileSync } from 'node:fs'
import { loadEnv, createClient } from './lib/llm-client.mjs'

loadEnv()

const USAGE = 'Usage: node scripts/spike-short-terms.mjs <deck.pdf> [--pages A-B] [--window 12] [--provider openai] [--model M] [--out f.json]'
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
const provider = flag('--provider', 'openai')
const windowSize = Number(flag('--window', 12))
const outPath = flag('--out')

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
        properties: { term: { type: 'string' }, gloss: { type: 'string' }, page: { type: 'integer' } },
      },
    },
  },
}

// Verbatim from scripts/generate-terms.mjs (3 Aug 2026). If that prompt changes, this control arm
// is no longer a control — re-copy it before trusting a rerun.
const controlPrompt = (from, to) => `You are building a CONCEPT GLOSSARY from a university lecture slide deck, for pages ${from} to ${to} only. Ignore every other page.

A concept is something with a definition that stands on its own — independent of any particular number, company, country, or year — that a student could be asked about in a context this deck never showed. A good disqualifying test: if stating the definition requires naming a specific company, country, or year, it is a DATA POINT, not a concept.

Explicitly EXCLUDE: chart titles, exhibit captions, data points, company names, country names, and section headings. "Netflix Subscribers Statistics 2025", "Mattel Japan Market Share" and "Session 6 Agenda" are captions and headings lifted from a slide title, not concepts — do not list them.

Do not list two concepts that are near-synonyms or that would share a definition — e.g. one concept describing a company's expansion into multiple countries and another describing its resulting geographic spread are the same idea twice. Merge them into one entry and keep whichever name the material actually uses. This matters beyond tidiness: two near-synonym concepts later become an MCQ's correct answer and its own distractor, which makes the item unanswerable.

There is NO required count and no target to hit. Return as many concepts as these pages genuinely teach — that may be zero, for a title page, a divider, or a slide that is purely a chart or case data. Returning an empty list is a CORRECT answer. Do not invent a concept to avoid an empty list, and do not pad the list to reach any particular number.

For each concept you DO list, give:
- "term": the concept's name, at most 5 words, taken from or clearly named in the material.
- "gloss": one line stating what it means, on its own, without naming a specific company/country/year.
- "page": the single page (between ${from} and ${to}) it comes from.`

// The single manipulated variable. Appended after the "at most 5 words" bullet so both arms share
// every other instruction.
const SHORT_CLAUSE = `

A concept's name may be of ANY length. Some concepts a deck teaches have a canonical name that is a single word or a short label; others are named by a longer phrase. Both are concepts, and short-named ones are routinely under-reported — if the material names and teaches one, list it.

Do NOT abbreviate, truncate, initialise, or invent a shorter name for a concept the material states as a phrase. Use whatever form the deck itself uses as the taught label. Inventing a short name is worse than omitting one, and a deck that genuinely teaches only phrasally-named concepts should return only phrasal ones.`

const shortPrompt = (from, to) => controlPrompt(from, to) + SHORT_CLAUSE

const cells = (t) => t.replace(/[^A-Za-z]/g, '').length
const words = (t) => t.trim().split(/\s+/).length

async function runArm(label, promptFor, ref) {
  const concepts = []
  for (let from = firstPage; from <= lastPage; from += windowSize) {
    const to = Math.min(from + windowSize - 1, lastPage)
    try {
      const { data } = await client.generateJSON({ ref, prompt: promptFor(from, to), schema: GLOSSARY_SCHEMA })
      const kept = (data.concepts || []).filter((c) => c.page >= from && c.page <= to)
      concepts.push(...kept)
      console.log(`  [${label}] pages ${from}-${to}: ${kept.length} concept(s)`)
    } catch (err) {
      console.error(`  [${label}] pages ${from}-${to}: FAILED — ${err.message}`)
    }
  }
  // Same normalisation the generator dedupes on, so the two arms are counted the same way.
  const seen = new Set(); const uniq = []
  for (const c of concepts) {
    const k = c.term.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^(the|an?)\s+/, '')
    if (seen.has(k)) continue
    seen.add(k); uniq.push(c)
  }
  return uniq
}

function report(label, concepts) {
  const lens = concepts.map((c) => cells(c.term)).sort((a, b) => a - b)
  const short = concepts.filter((c) => cells(c.term) <= 8)
  const single = concepts.filter((c) => words(c.term) === 1)
  const med = lens.length ? lens[Math.floor(lens.length / 2)] : null
  console.log(`\n--- ${label} ---`)
  console.log(`concepts: ${concepts.length}  min: ${lens[0] ?? '-'}  median: ${med ?? '-'}  max: ${lens[lens.length - 1] ?? '-'}`)
  console.log(`<=8 cells: ${short.length}  single-word: ${single.length}`)
  if (short.length) console.log(`short terms: ${short.map((c) => `${c.term}(${cells(c.term)})`).join(', ')}`)
  console.log(concepts.map((c) => `  ${String(cells(c.term)).padStart(2)}  ${c.term}`).join('\n'))
  return { label, count: concepts.length, min: lens[0] ?? null, median: med, max: lens[lens.length - 1] ?? null, shortCount: short.length, singleWordCount: single.length, concepts }
}

console.log(`Deck: ${pdfPath}  pages ${firstPage}-${lastPage}  window ${windowSize}  provider ${provider}\n`)
const ref = await client.uploadPdf(pdfPath)
let out
try {
  const control = await runArm('control', controlPrompt, ref)
  const short = await runArm('short', shortPrompt, ref)
  const a = report('ARM A — control (production prompt)', control)
  const b = report('ARM B — short-name clause added', short)
  const gained = b.concepts.filter((c) => cells(c.term) <= 8 && !a.concepts.some((x) => x.term.toLowerCase() === c.term.toLowerCase()))
  console.log(`\n=== VERDICT ===`)
  console.log(`<=8-cell terms: control ${a.shortCount}, short-arm ${b.shortCount}`)
  console.log(gained.length
    ? `SIZE-ish: the clause surfaced ${gained.length} new short term(s) — ${gained.map((c) => c.term).join(', ')}`
    : `SHAPE-ish: no new <=8-cell terms appeared even when asked for them.`)
  out = { deck: pdfPath, pages: [firstPage, lastPage], provider, arms: [a, b], gained }
} finally {
  await client.deleteFile(ref)
}
if (outPath) { writeFileSync(outPath, JSON.stringify(out, null, 2)); console.log(`\nWrote ${outPath}`) }
