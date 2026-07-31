#!/usr/bin/env node
// Package K/R1 calibration pass — turns simulated performance into the 1-5 `difficulty` column
// the adaptive lever selects on (`lib/game/questions.ts` `pickQuestion`, once it reads from
// content_items per package Q1). Method and evidence:
//   docs/experiments/2026-07-31_grounded-difficulty-simulation.md
//   docs/literature/item-difficulty-without-students.md
// Schema: db/005_add_simulated_difficulty.sql, db/006_add_content_item_difficulty.sql.
//
// Usage:
//   node scripts/calibrate-difficulty.mjs [--subject "Digital Transformation"] [--n 30] [--dry-run]
//
// The simulator is fixed to llama3.2 via local Ollama, grounded-retention method — not a flag, the
// way the spike's --provider/--model are. This pass seeds the live item bank with ONE simulator's
// numbers; exploring alternatives is what scripts/spike-simulate-difficulty.mjs is for. (CLAUDE.md:
// weaker local models simulate students better here — gemma4:31b-cloud in `ollama list` is a CLOUD
// model and must not be used.)
//
// ALL-OR-NOTHING. Every eligible item is simulated first; the database is written only once every
// value is known, in a single transaction. `difficulty` is a quintile rank over the WHOLE run's
// distribution, so a partial write would leave the column meaning two different things at once
// (db/006). If simulation fails partway (Ollama down, the transport-error budget blown), nothing is
// written and the process exits non-zero.
//
// THE INVERSION. `simulated_p` is the fraction of simulated students who answered correctly, so a
// high p means EASY. `difficulty` is 1 = easiest, 5 = hardest. The mapping in
// scripts/lib/quintile-difficulty.mjs is therefore inverted: top quintile of simulated_p ->
// difficulty 1, bottom quintile -> difficulty 5. Verified by tests/quintile-difficulty.test.ts.

import { readFileSync, writeFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { loadEnv } from './lib/llm-client.mjs'
import { buildCohort, makeAsker, simulateQuestion } from './lib/simulate-students.mjs'
import { quintileDifficulty } from './lib/quintile-difficulty.mjs'

loadEnv()

const USAGE = 'Usage: node scripts/calibrate-difficulty.mjs [--subject "Name"] [--n 30] [--dry-run] [--out run.json] [--from run.json]'
const die = (msg) => { console.error(`${msg}\n${USAGE}`); process.exit(1) }
const flag = (name, fallback = null) => {
  const i = process.argv.indexOf(name)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  if (!v || v.startsWith('--')) die(`${name} needs a value.`)
  return v
}

const subject = flag('--subject')
const N = Number(flag('--n', 30))
if (!Number.isInteger(N) || N < 1) die('--n must be a positive integer.')
const DRY_RUN = process.argv.includes('--dry-run')
const RUN_OUT = flag('--out')
const FROM = flag('--from') // re-apply a saved run without re-simulating

/** Seed from the item's own id, not its position in the result set. Index-based seeds would change
 *  every existing item's simulated_p as soon as one item is added to the bank, making a
 *  bank-composition change indistinguishable from a real difficulty change. */
const seedFor = (id) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  return (h >>> 0) % 2147483647 || 1
}
const CONCURRENCY = 4 // CPU-bound local inference, not a network limit; matches the spike's default

const MODEL = 'llama3.2'
const METHOD = 'grounded-retention' // db/005's CHECK only allows 'ungrounded' | 'grounded-full' | 'grounded-retention'

const DB = process.env.DATABASE_URL
if (!DB) die('Missing DATABASE_URL.')
const sql = neon(DB)

// --- 1. find the rows needing calibration ---
// Joined to `sources` for a human title to show the simulated student ("this is what you remember
// from the session slide ..."); falls back to the item's own topic if the join has nothing better.
const candidates = subject
  ? await sql`
      select ci.id, ci.subject, ci.topic, ci.stem, ci.options, ci.answer, ci.source_excerpt, s.title as source_title
      from content_items ci join sources s on s.id = ci.source_id
      where ci.kind = 'mcq' and ci.subject = ${subject}
      order by ci.id
    `
  : await sql`
      select ci.id, ci.subject, ci.topic, ci.stem, ci.options, ci.answer, ci.source_excerpt, s.title as source_title
      from content_items ci join sources s on s.id = ci.source_id
      where ci.kind = 'mcq'
      order by ci.id
    `

// Items whose source_excerpt is missing must be skipped and reported, never guessed at — a
// simulated student who never saw the material measures "how much does this depend on the deck",
// not "how hard is it" (docs/experiments/2026-07-31_grounded-difficulty-simulation.md, Result 1).
const skipped = candidates.filter((r) => !r.source_excerpt || !r.source_excerpt.trim())
const eligible = candidates.filter((r) => r.source_excerpt && r.source_excerpt.trim())

console.log(`${candidates.length} mcq item(s)${subject ? ` in subject "${subject}"` : ''}: ${eligible.length} eligible, ${skipped.length} skipped (no source_excerpt).`)
for (const r of skipped) console.log(`  SKIP ${r.id}  ${(r.stem ?? '(no stem)').slice(0, 70)}`)

if (!eligible.length) {
  console.log('Nothing to calibrate.')
  process.exit(0)
}

// --- 2. simulate every eligible item (nothing is written yet) ---
const ask = makeAsker({ provider: 'ollama', model: MODEL })
const cohort = buildCohort(N)

// --from re-applies a saved run. The bins are recomputed from the saved scores rather than trusted,
// so a fix to the binning rule reaches an already-simulated run without paying for the simulation
// again. Guarded on the item set matching: quintiles are ranks within one distribution, so applying
// a run computed over a different set of items would silently mean something else.
if (FROM) {
  const saved = JSON.parse(readFileSync(FROM, 'utf8'))
  const savedIds = new Set(saved.results.map((r) => r.id))
  const eligibleIds = new Set(eligible.map((r) => r.id))
  const same = savedIds.size === eligibleIds.size && [...savedIds].every((id) => eligibleIds.has(id))
  if (!same) die(`${FROM} covers ${savedIds.size} item(s) but ${eligibleIds.size} are eligible now. Difficulty is a rank within one run's distribution, so a saved run cannot be applied to a different item set. Re-simulate.`)
  const reapplied = saved.results.map(({ id, p }) => ({ id, p }))
  const bins = quintileDifficulty(reapplied.map((r) => r.p))
  reapplied.forEach((r, i) => { r.difficulty = bins[i] })
  console.log(`\nRe-applying ${FROM}: ${reapplied.length} item(s), model "${saved.model}", n=${saved.n}. No simulation run.`)
  if (DRY_RUN) {
    for (const r of [...reapplied].sort((a, b) => b.p - a.p)) console.log(`  difficulty ${r.difficulty}  p=${r.p.toFixed(2)}  ${r.id}`)
    console.log('\n--dry-run: nothing written to the database.')
    process.exit(0)
  }
  await sql.transaction(reapplied.map((r) => sql`
    update content_items
    set simulated_p = ${r.p}, simulated_n = ${saved.n}, simulator_model = ${saved.model},
        simulator_method = ${saved.method}, difficulty = ${r.difficulty}
    where id = ${r.id}
  `))
  console.log(`Wrote ${reapplied.length} item(s) from the saved run.`)
  process.exit(0)
}
console.log(`\nSimulating ${eligible.length} item(s) x ${cohort.length} student(s) on "${MODEL}" via Ollama (${METHOD})...`)

const results = []
let errors = 0
let unparseable = 0
for (let i = 0; i < eligible.length; i++) {
  const row = eligible[i]
  const question = { prompt: row.stem, options: row.options, answer: row.answer }
  const excerpt = { text: row.source_excerpt, title: row.topic || row.source_title || 'this item' }
  const { p, errorCount, unparseableCount } = await simulateQuestion({
    ask, question, excerpt, cohort,
    seedBase: seedFor(row.id), retention: true, concurrency: CONCURRENCY,
  })
  errors += errorCount
  unparseable += unparseableCount
  // Same abort budget as the spike this method came from: a transport error is not a wrong answer,
  // and because the write is all-or-nothing there is nothing worth salvaging from a broken run.
  if (errors > cohort.length * 0.02 * eligible.length + 2) {
    console.error(`\nABORTING: ${errors} transport errors talking to Ollama. Writing nothing to the database.`)
    process.exit(1)
  }
  results.push({ id: row.id, p })
  console.log(`  [${String(i).padStart(2)}] ${(p * 100).toFixed(0).padStart(3)}%  ${row.id}  ${(row.stem ?? '').slice(0, 60)}`)
}
console.log(`\n${eligible.length} item(s) simulated, ${cohort.length * eligible.length} responses, ${unparseable} unparseable, ${errors} transport error(s).`)

// --- 3. bin by quintile over THIS run's distribution (never fixed thresholds, db/006) ---
const difficulties = quintileDifficulty(results.map((r) => r.p))
results.forEach((r, i) => { r.difficulty = difficulties[i] })

console.log(`\nProposed bins (top quintile of simulated_p = difficulty 1 / easiest; bottom quintile = difficulty 5 / hardest):`)
for (const r of [...results].sort((a, b) => b.p - a.p)) {
  console.log(`  difficulty ${r.difficulty}  p=${r.p.toFixed(2)}  ${r.id}`)
}
const counts = [1, 2, 3, 4, 5].map((d) => results.filter((r) => r.difficulty === d).length)
console.log(`Distribution: ${counts.map((c, i) => `d${i + 1}=${c}`).join('  ')}`)

// Persist the computed run to disk BEFORE touching the network. The first real run spent ~20
// minutes simulating 510 responses, then lost all of it to a transient DNS failure resolving the
// Neon host -- the results existed only in memory. Simulation is the expensive half and the write
// is the cheap half, so the expensive half must survive the cheap half failing.
// Re-apply a saved run with --from <file>, no re-simulation.
const stamp = RUN_OUT ?? `spike-data/calibration-${MODEL.replace(/[^a-z0-9]+/gi, '-')}-latest.json`
try {
  writeFileSync(stamp, JSON.stringify({ model: MODEL, method: METHOD, n: cohort.length, results }, null, 2))
  console.log(`\nRun saved to ${stamp} (re-apply with --from ${stamp} if the write fails).`)
} catch (err) {
  console.error(`WARNING: could not save the run to ${stamp}: ${err.message}`)
  console.error('Continuing to the database write, but a failure here loses the simulation.')
}

if (DRY_RUN) {
  console.log('\n--dry-run: nothing written to the database.')
  process.exit(0)
}

// --- 4. write everything in one transaction, or nothing at all ---
// db/005's provenance CHECK rejects simulated_p arriving without simulated_n, simulator_model AND
// simulator_method, so all four (plus difficulty) are written together, per row, in the same
// statement -- and every row's statement lands in one HTTP transaction so the run is atomic.
const updates = results.map((r) => sql`
  update content_items
  set simulated_p = ${r.p}, simulated_n = ${cohort.length}, simulator_model = ${MODEL},
      simulator_method = ${METHOD}, difficulty = ${r.difficulty}
  where id = ${r.id}
`)
await sql.transaction(updates)
console.log(`\nWrote simulated_p/simulated_n/simulator_model/simulator_method/difficulty for ${results.length} item(s).`)
