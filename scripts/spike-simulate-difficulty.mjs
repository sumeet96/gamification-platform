#!/usr/bin/env node
// PHASE 0 SPIKE — throwaway. Does LLM student simulation produce a usable difficulty
// signal on management prose? Published correlations (r=0.75-0.82) are all maths
// against a national benchmark; this domain is unvalidated. See
// docs/literature/item-difficulty-without-students.md.
//
// The method: do NOT ask a model how hard an item is (that produced the current
// non-discriminating 1-5 labels). Make models ATTEMPT it at stated ability levels
// and measure how often they fail.
//
// Usage:
//   node scripts/spike-simulate-difficulty.mjs <questions.json> [--model llama3.2] [--n 30] [--concurrency 4]
//                                              [--source excerpts.json] [--retention] [--out rows.json] [--label name]
//
// Kill criterion, stated in advance: if success rates cluster into a narrow band
// (e.g. everything 0.8-1.0) or show no relation to human judgement of which items
// are hard, the method does not transfer. Say so and stop.
//
// GROUNDING (--source). Without it the simulated students have never seen the deck, so what
// gets measured is how much a question depends on its source, not how hard it is. --source
// supplies the excerpt the item came from, aligned by index with the questions file.
//   --source alone      each tier reads the full excerpt. Tests the ceiling: if an MCQ with its
//                       source in context is just reading comprehension, everything scores ~1.0.
//   --source --retention the excerpt is thinned per ability tier, so a weak student "remembers"
//                       less of the slide. This is the analogue of a student who attended.
//
// The tier mix, retention thinning, seeded shuffle and provider calls live in
// scripts/lib/simulate-students.mjs, shared with scripts/calibrate-difficulty.mjs. This file is
// the instrument the published results in docs/experiments/2026-07-31_grounded-difficulty-simulation.md
// came from — its flags, seeds and output format must stay exactly as they were.

import { readFileSync, writeFileSync } from 'node:fs'
import { TIERS, buildCohort, makeAsker, simulateQuestion, hashId } from './lib/simulate-students.mjs'

// --- .env.local, for --provider gemini (no dependency) ---
try {
  const txt = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* only needed for the gemini provider */ }

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

const inPath = process.argv[2]
if (!inPath || inPath.startsWith('--')) {
  console.error('Usage: node scripts/spike-simulate-difficulty.mjs <questions.json> [--model M] [--n 30] [--concurrency 4]')
  process.exit(1)
}
const PROVIDER = arg('--provider', 'ollama')
if (!['ollama', 'gemini', 'openai'].includes(PROVIDER)) { console.error(`--provider must be "ollama", "gemini" or "openai"`); process.exit(1) }
const DEFAULT_MODEL = { ollama: 'llama3.2', gemini: process.env.GEMINI_MODEL || 'gemini-2.0-flash', openai: 'gpt-3.5-turbo-0125' }
const MODEL = arg('--model', DEFAULT_MODEL[PROVIDER])
if (PROVIDER === 'gemini' && !process.env.GEMINI_API_KEY) { console.error('Missing GEMINI_API_KEY (set it in .env.local).'); process.exit(1) }
if (PROVIDER === 'openai' && !process.env.OPENAI_API_KEY) { console.error('Missing OPENAI_API_KEY (set it in the shell or .env.local).'); process.exit(1) }
const N = Number(arg('--n', 30))
const CONCURRENCY = Number(arg('--concurrency', 4))
const SOURCE = arg('--source', null)
const RETENTION = process.argv.includes('--retention')
const OUT = arg('--out', null)
const LABEL = arg('--label', SOURCE ? (RETENTION ? 'grounded-retention' : 'grounded-full') : 'ungrounded')

const ask = makeAsker({
  provider: PROVIDER,
  model: MODEL,
  apiKey: PROVIDER === 'openai' ? process.env.OPENAI_API_KEY : PROVIDER === 'gemini' ? process.env.GEMINI_API_KEY : undefined,
})

const questions = JSON.parse(readFileSync(inPath, 'utf8'))
const excerpts = SOURCE ? JSON.parse(readFileSync(SOURCE, 'utf8')) : null
if (excerpts && excerpts.length !== questions.length) {
  console.error(`--source has ${excerpts.length} excerpts for ${questions.length} questions; they must align by index.`)
  process.exit(1)
}
const cohort = buildCohort(N)
console.log(`[${LABEL}] ${cohort.length} students x ${questions.length} questions on "${MODEL}" via ${PROVIDER} (concurrency ${CONCURRENCY})`)
console.log(`Grounding: ${SOURCE ? (RETENTION ? 'source excerpt, thinned per tier' : 'full source excerpt for every tier') : 'none — students never saw the deck'}`)
console.log(`Cohort: ${TIERS.map((t) => `${t.name} ${cohort.filter((c) => c === t).length}`).join(', ')}\n`)

const t0 = Date.now()
const rows = []
let unparseable = 0
let errors = 0

for (let qi = 0; qi < questions.length; qi++) {
  const q = questions[qi]
  // Seed from the item's own id when it has one (CLAUDE.md: "Do not seed the simulator from array
  // position. Item id only.") -- subsetting the item set must not re-seed every surviving item after
  // the first drop. `(qi + 1) * 7919` remains only as a fallback for decks with no `id` field (e.g.
  // spike-data/deck-cage.json), so those published results reproduce exactly as before.
  const seedBase = q.id ? hashId(q.id) : (qi + 1) * 7919
  const { p, byTier, errorCount, unparseableCount } = await simulateQuestion({
    ask, question: q, excerpt: excerpts?.[qi], cohort,
    seedBase, retention: RETENTION, concurrency: CONCURRENCY,
  })
  errors += errorCount
  // A transport error is NOT a wrong answer. Scoring one as wrong invents a hard question out of a
  // rate limit, so errors are counted separately and the run aborts rather than publish a fiction.
  if (errors > cohort.length * 0.02 * questions.length + 2) {
    console.error(`\nABORTING: ${errors} transport errors. The provider is failing; these would be scored as wrong answers and the difficulty estimates would be fiction.`)
    process.exit(1)
  }
  unparseable += unparseableCount
  rows.push({ i: qi, p, byTier, topic: q.topic ?? '', asserted: q.difficulty ?? null, prompt: q.prompt })
  const bar = '#'.repeat(Math.round(p * 30)).padEnd(30, '.')
  console.log(`[${String(qi).padStart(2)}] ${bar} ${(p * 100).toFixed(0).padStart(3)}%  (labelled ${q.difficulty ?? '?'})  ${String(q.topic ?? '').slice(0, 28)}`)
}

const secs = (Date.now() - t0) / 1000
const ps = rows.map((r) => r.p)
const mean = ps.reduce((a, b) => a + b, 0) / ps.length
const spread = Math.max(...ps) - Math.min(...ps)

console.log(`\n--- ${rows.length} questions, ${cohort.length * rows.length} simulated responses in ${secs.toFixed(0)}s ---`)
console.log(`per response: ${(secs / (cohort.length * rows.length) * 1000).toFixed(0)} ms`)
console.log(`unparseable replies: ${unparseable}   transport errors: ${errors}`)
console.log(`success rate  min ${Math.min(...ps).toFixed(2)}  mean ${mean.toFixed(2)}  max ${Math.max(...ps).toFixed(2)}  spread ${spread.toFixed(2)}`)

console.log(`\nHardest first (this is the ordering to sanity-check by eye):`)
for (const r of [...rows].sort((a, b) => a.p - b.p)) {
  console.log(`  ${(r.p * 100).toFixed(0).padStart(3)}%  labelled ${r.asserted ?? '?'}  ${r.prompt.slice(0, 88)}`)
}

console.log(`\nBy ability tier (a usable simulation should slope upward — weak students score lower):`)
for (const t of TIERS) {
  const vals = rows.map((r) => r.byTier[t.name]).filter((v) => v !== undefined)
  if (vals.length) console.log(`  ${t.name.padEnd(12)} ${(vals.reduce((a, b) => a + b, 0) / vals.length * 100).toFixed(0)}%`)
}

console.log(`\nGATE: spread < 0.20 means the signal is too flat to bin into 5 bands — that is a fail.`)
console.log(`      Also check the ordering above against your own read of which are hard.`)

if (OUT) {
  writeFileSync(OUT, JSON.stringify({ label: LABEL, provider: PROVIDER, model: MODEL, n: N, grounded: !!SOURCE, retention: RETENTION, seconds: secs, unparseable, rows }, null, 2))
  console.log(`\nWrote ${OUT}`)
}
