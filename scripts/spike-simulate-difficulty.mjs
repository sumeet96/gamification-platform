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

import { readFileSync, writeFileSync } from 'node:fs'

const OLLAMA = 'http://localhost:11434/api/chat'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? fallback : process.argv[i + 1]
}

const inPath = process.argv[2]
if (!inPath || inPath.startsWith('--')) {
  console.error('Usage: node scripts/spike-simulate-difficulty.mjs <questions.json> [--model M] [--n 30] [--concurrency 4]')
  process.exit(1)
}
const MODEL = arg('--model', 'llama3.2')
const N = Number(arg('--n', 30))
const CONCURRENCY = Number(arg('--concurrency', 4))
const SOURCE = arg('--source', null)
const RETENTION = process.argv.includes('--retention')
const OUT = arg('--out', null)
const LABEL = arg('--label', SOURCE ? (RETENTION ? 'grounded-retention' : 'grounded-full') : 'ungrounded')

// Ability mix mirrors the source paper's NAEP-shaped distribution. `retention` is the fraction of
// the source excerpt a student at this tier still remembers — the mechanism by which an item can be
// hard even with the material in front of you.
const TIERS = [
  { name: 'Below Basic', weight: 0.25, retention: 0.30, persona: 'You are a student who has struggled with this subject. You attended the session but retained little, and you often confuse similar-sounding concepts. You guess when unsure.' },
  { name: 'Basic',       weight: 0.35, retention: 0.55, persona: 'You are an average student. You attended the session and remember the main points, but details and figures are hazy. You reason plausibly but make mistakes on specifics.' },
  { name: 'Proficient',  weight: 0.25, retention: 0.80, persona: 'You are a solid student. You paid attention, took notes, and recall most of the material accurately, though very fine details can slip.' },
  { name: 'Advanced',    weight: 0.15, retention: 1.00, persona: 'You are a top student. You know this material thoroughly and reason carefully about distinctions between options.' },
]

/** Expand the weighted tier mix into exactly N concrete simulated students. */
function buildCohort(n) {
  const cohort = []
  for (const t of TIERS) cohort.push(...Array(Math.round(n * t.weight)).fill(t))
  while (cohort.length < n) cohort.push(TIERS[1])
  return cohort.slice(0, n)
}

/** Seeded xorshift, so every run is reproducible and the arms are directly comparable. */
function rng(seed) {
  let s = seed || 1
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 }
}

/** Deterministic-per-call shuffle so option position can't bias the estimate.
 *  The generator already put 15/15 correct answers at index 0; a model with an
 *  A-bias would otherwise score high for the wrong reason. */
function shuffled(options, answerIdx, seed) {
  const idx = options.map((_, i) => i)
  const rand = rng(seed)
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return { options: idx.map((i) => options[i]), answer: idx.indexOf(answerIdx) }
}

/** What this student still remembers of the slide: the heading, plus a tier-sized sample of the
 *  remaining lines in their original order. Dropping lines rather than paraphrasing keeps the
 *  surviving text verbatim, so a wrong answer means the fact was forgotten, not garbled. */
function recall(text, tier, seed) {
  if (!RETENTION || tier.retention >= 1) return text
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length <= 2) return text
  const [head, ...rest] = lines
  const keep = Math.max(1, Math.round(rest.length * tier.retention))
  const rand = rng(seed)
  const order = rest.map((l, i) => ({ l, i, r: rand() })).sort((a, b) => a.r - b.r).slice(0, keep)
  return [head, ...order.sort((a, b) => a.i - b.i).map((o) => o.l)].join('\n')
}

const LETTERS = ['A', 'B', 'C', 'D']

async function askOnce(q, tier, seed, excerpt) {
  const { options, answer } = shuffled(q.options, q.answer, seed)
  const remembered = excerpt ? recall(excerpt.text, tier, seed + 1) : null
  const system = remembered
    ? `${tier.persona}\n\nThis is what you remember from the session slide "${excerpt.title}":\n"""\n${remembered}\n"""\nAnswer from that memory. If it does not cover the question, answer as best you can.\nAnswer with a single letter (A, B, C or D) and nothing else.`
    : `${tier.persona}\nAnswer with a single letter (A, B, C or D) and nothing else.`
  const body = {
    model: MODEL,
    stream: false,
    options: { temperature: 0.8, num_predict: 4 }, // >0 so students of a tier differ; tiny output keeps CPU inference fast
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `${q.prompt}\n\n${options.map((o, i) => `${LETTERS[i]}. ${o}`).join('\n')}\n\nAnswer with one letter only.` },
    ],
  }
  const res = await fetch(OLLAMA, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const raw = (data?.message?.content ?? '').trim().toUpperCase()
  const m = raw.match(/[ABCD]/)
  if (!m) return { correct: false, parsed: null, tier: tier.name }  // unparseable counts as wrong, like a real blank
  return { correct: LETTERS.indexOf(m[0]) === answer, parsed: m[0], tier: tier.name }
}

/** Run tasks with a fixed concurrency cap — CPU inference dies under unbounded fan-out. */
async function pool(tasks, limit) {
  const out = []
  let cursor = 0
  await Promise.all(Array(Math.min(limit, tasks.length)).fill(0).map(async () => {
    while (cursor < tasks.length) out.push(await tasks[cursor++]())
  }))
  return out
}

const questions = JSON.parse(readFileSync(inPath, 'utf8'))
const excerpts = SOURCE ? JSON.parse(readFileSync(SOURCE, 'utf8')) : null
if (excerpts && excerpts.length !== questions.length) {
  console.error(`--source has ${excerpts.length} excerpts for ${questions.length} questions; they must align by index.`)
  process.exit(1)
}
const cohort = buildCohort(N)
console.log(`[${LABEL}] ${cohort.length} students x ${questions.length} questions on "${MODEL}" (concurrency ${CONCURRENCY})`)
console.log(`Grounding: ${SOURCE ? (RETENTION ? 'source excerpt, thinned per tier' : 'full source excerpt for every tier') : 'none — students never saw the deck'}`)
console.log(`Cohort: ${TIERS.map((t) => `${t.name} ${cohort.filter((c) => c === t).length}`).join(', ')}\n`)

const t0 = Date.now()
const rows = []
let unparseable = 0

for (let qi = 0; qi < questions.length; qi++) {
  const q = questions[qi]
  const tasks = cohort.map((tier, si) => () => askOnce(q, tier, (qi + 1) * 7919 + si * 104729, excerpts?.[qi]).catch((e) => {
    console.error(`  ! ${e.message}`)
    return { correct: false, parsed: null, tier: tier.name }
  }))
  const results = await pool(tasks, CONCURRENCY)
  unparseable += results.filter((r) => r.parsed === null).length
  const p = results.filter((r) => r.correct).length / results.length
  const byTier = {}
  for (const t of TIERS) {
    const rs = results.filter((r) => r.tier === t.name)
    if (rs.length) byTier[t.name] = rs.filter((r) => r.correct).length / rs.length
  }
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
console.log(`unparseable replies: ${unparseable}`)
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
  writeFileSync(OUT, JSON.stringify({ label: LABEL, model: MODEL, n: N, grounded: !!SOURCE, retention: RETENTION, seconds: secs, unparseable, rows }, null, 2))
  console.log(`\nWrote ${OUT}`)
}
