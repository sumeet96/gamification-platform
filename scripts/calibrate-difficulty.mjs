#!/usr/bin/env node
// Package K/R1 calibration pass — turns simulated performance into the 1-5 `difficulty` column
// the adaptive lever selects on (`lib/game/questions.ts` `pickQuestion`, once it reads from
// content_items per package Q1). Method and evidence:
//   docs/experiments/2026-07-31_grounded-difficulty-simulation.md
//   docs/literature/item-difficulty-without-students.md
// Schema: db/005_add_simulated_difficulty.sql, db/006_add_content_item_difficulty.sql.
//
// Usage:
//   node scripts/calibrate-difficulty.mjs --model llama3.2:3b [--subject "Digital Transformation"] [--n 30] [--dry-run]
//   node scripts/calibrate-difficulty.mjs --from run.json --items questions.json [--dry-run]
//
// The method is fixed to grounded-retention via local Ollama — not a flag, the way the spike's
// --provider is. The MODEL is not fixed: the bake-off (CLAUDE.md, 1 Aug 2026) found simulator choice
// is item-type dependent — llama3.2:3b for slide MCQs, llama3.2:1b for term MCQs — so a single
// hardcoded default would silently misattribute provenance. --model is therefore required on the
// fresh-simulation path. (gemma4:31b-cloud in `ollama list` is a CLOUD model and must not be used.)
// This pass seeds the live item bank with ONE simulator's numbers; exploring alternatives is what
// scripts/spike-simulate-difficulty.mjs is for.
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
import { joinRunToItems } from './lib/join-run-to-items.mjs'

loadEnv()

const USAGE = 'Usage: node scripts/calibrate-difficulty.mjs --model <name> [--subject "Name"] [--n 30] [--seed-offset 0] [--dry-run] [--out run.json]\n   or: node scripts/calibrate-difficulty.mjs --from run.json --items questions.json [--dry-run]'
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
const ITEMS = flag('--items') // --from only: the questions JSON the run was produced from, joined by index
const MODEL_FLAG = flag('--model') // fresh-simulation path only; --from reads the model from the saved run
// Opt-out for defect 3's scale-incompatibility guard (see below) -- a deliberate second batch of the
// SAME kind, applied on top of an already-calibrated one, with the caller accepting the two runs'
// quintile bins will not compare on one scale.
const ALLOW_PARTIAL_APPLY = process.argv.includes('--allow-partial-apply')

// db/005_add_simulated_difficulty.sql content_items_simulator_method_check — the only values the
// column will accept. Anything derived for a write must be checked against this before it is sent.
const METHOD_ALLOWLIST = ['ungrounded', 'grounded-full', 'grounded-retention']

/** Seed from the item's own id, not its position in the result set. Index-based seeds would change
 *  every existing item's simulated_p as soon as one item is added to the bank, making a
 *  bank-composition change indistinguishable from a real difficulty change.
 *
 *  `--seed-offset` shifts every per-item seed by a constant, which is the ONLY way to draw a second,
 *  genuinely independent sample of simulated students from the same bank. Without it two runs at the
 *  same --n over the same items are byte-identical (the seed is a pure function of the item id and
 *  Ollama honours seeds), so a "run it twice and compare bands" reproducibility check would return
 *  100% agreement by construction and measure nothing. Found 6 Aug 2026 before an overnight run.
 *  Default 0 keeps every existing invocation, and every already-published number, unchanged. */
const SEED_OFFSET = Number(flag('--seed-offset', 0))
if (!Number.isInteger(SEED_OFFSET) || SEED_OFFSET < 0) die('--seed-offset must be a non-negative integer.')
const seedFor = (id) => {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  return ((h >>> 0) + SEED_OFFSET) % 2147483647 || 1
}
const CONCURRENCY = 4 // CPU-bound local inference, not a network limit; matches the spike's default

const METHOD = 'grounded-retention' // fixed for the fresh-simulation path; db/005's CHECK also allows 'ungrounded' | 'grounded-full'

const DB = process.env.DATABASE_URL
if (!DB) die('Missing DATABASE_URL.')
const sql = neon(DB)

// --- 1. find the rows needing calibration ---
// Joined to `sources` for a human title to show the simulated student ("this is what you remember
// from the session slide ..."); falls back to the item's own topic if the join has nothing better.
// Both content_items kinds are eligible: `mcq` natively, and `term_definition` because package A3's
// rendering shim (clue as stem, term+distractors as options) makes every term row an MCQ too — see
// CLAUDE.md, "term items are calibratable after all", 1 Aug 2026.
const candidates = subject
  ? await sql`
      select ci.id, ci.subject, ci.topic, ci.kind, ci.term, ci.stem, ci.options, ci.answer, ci.difficulty, ci.source_excerpt, s.title as source_title
      from content_items ci join sources s on s.id = ci.source_id
      where ci.kind in ('mcq', 'term_definition') and ci.subject = ${subject}
      order by ci.id
    `
  : await sql`
      select ci.id, ci.subject, ci.topic, ci.kind, ci.term, ci.stem, ci.options, ci.answer, ci.difficulty, ci.source_excerpt, s.title as source_title
      from content_items ci join sources s on s.id = ci.source_id
      where ci.kind in ('mcq', 'term_definition')
      order by ci.id
    `

// Items whose source_excerpt is missing must be skipped and reported, never guessed at — a
// simulated student who never saw the material measures "how much does this depend on the deck",
// not "how hard is it" (docs/experiments/2026-07-31_grounded-difficulty-simulation.md, Result 1).
const skipped = candidates.filter((r) => !r.source_excerpt || !r.source_excerpt.trim())
const eligible = candidates.filter((r) => r.source_excerpt && r.source_excerpt.trim())
const eligibleIds = new Set(eligible.map((r) => r.id))

console.log(`${candidates.length} item(s)${subject ? ` in subject "${subject}"` : ''}: ${eligible.length} eligible, ${skipped.length} skipped (no source_excerpt).`)
for (const r of skipped) console.log(`  SKIP ${r.id}  ${(r.stem ?? r.term ?? '(no stem)').slice(0, 70)}`)

// --from re-applies a saved spike-simulate-difficulty.mjs run without re-simulating. That run file
// has no item ids (scripts/spike-simulate-difficulty.mjs:133 emits {i, p, byTier, topic, ...} per
// row, not {id, p}) — --items must point at the exact questions JSON the run was produced from, so
// identity is recovered by joining row i to items[i].id. The bins are recomputed from the saved
// scores rather than trusted, so a fix to the binning rule reaches an already-simulated run without
// paying for the simulation again. A run applies over ONLY the ids present in the two files — a
// partial-subset apply is the normal case now, not an error — but every one of those ids must
// resolve to an eligible DB row, or the write silently lands on the wrong item.
if (FROM) {
  if (!ITEMS) die('--from requires --items <file>, the questions JSON the run was produced from (rows are joined to item ids by array index).')
  const saved = JSON.parse(readFileSync(FROM, 'utf8'))
  if (!Array.isArray(saved.rows)) die(`${FROM} has no "rows" array — is this a spike-simulate-difficulty.mjs run file?`)
  const items = JSON.parse(readFileSync(ITEMS, 'utf8'))
  if (!Array.isArray(items)) die(`${ITEMS} is not a JSON array of items.`)
  // The index-to-id join and its four guards (duplicate id, length, row.i, prompt drift) live in
  // scripts/lib/join-run-to-items.mjs, shared with scripts/analyse-item-gap.mjs -- see that file for
  // the rationale behind each guard. terms-mcq-clean.json in particular is regenerated in place with
  // rows ordered by id, so a repair pass can insert re-admitted rows at pseudorandom positions and
  // shift the tail; the prompt-equality guard is what catches that.
  let joined
  try {
    joined = joinRunToItems(saved.rows, items, { runLabel: FROM, itemsLabel: ITEMS }).map((r) => ({ id: r.id, p: r.p, label: r.label }))
  } catch (err) {
    die(err.message)
  }
  const missing = joined.filter((r) => !eligibleIds.has(r.id))
  if (missing.length) die(`${missing.length} id(s) from ${ITEMS} are not eligible content_items in the DB right now (missing, wrong kind, or no source_excerpt) — refusing a silent partial write: ${missing.slice(0, 5).map((r) => r.id).join(', ')}${missing.length > 5 ? ', ...' : ''}.`)

  // FIX 3: `difficulty` is a quintile rank over THIS run's own distribution (db/006), not a fixed
  // scale. This batch may cover only a SUBSET of one kind (e.g. 33 of 50 term rows, with the other 17
  // planned as a second --from apply after a repair pass) -- if another row of the SAME kind already
  // carries a `difficulty` from a DIFFERENT run, the two runs' bins do not compare, yet
  // lib/games/item-select.ts:106 compares |difficulty - target| across the whole pool regardless.
  // Checked PER KIND so a term_definition batch is never blocked by the already-calibrated 'mcq' rows
  // (or vice versa) -- they are different pools. --allow-partial-apply opts out explicitly.
  // Answered from `candidates` (already fetched above, difficulty included in its SELECT) rather than
  // a fresh query: a second network round trip here reliably crashed the process on exit (a libuv
  // UV_HANDLE_CLOSING assertion racing process.exit(0) against an in-flight fetch teardown) --
  // reproduced 3/3 runs. `candidates` already covers every current mcq/term_definition row regardless
  // of source_excerpt, which is the right universe for "any OTHER row of this kind".
  if (!ALLOW_PARTIAL_APPLY) {
    const kindById = new Map(eligible.map((r) => [r.id, r.kind]))
    const kindsInBatch = [...new Set(joined.map((r) => kindById.get(r.id)))]
    for (const kind of kindsInBatch) {
      const batchIds = new Set(joined.filter((r) => kindById.get(r.id) === kind).map((r) => r.id))
      const other = candidates.find((c) => c.kind === kind && c.difficulty !== null && !batchIds.has(c.id))
      if (other) die(`Refusing a subset apply: a content_items row of kind "${kind}" (e.g. ${other.id}) already has a calibrated difficulty from a DIFFERENT run, not present in ${ITEMS}. Binning this ${batchIds.size}-item batch on top would make difficulty compare two incompatible scales within the same word-game pool (lib/games/item-select.ts:106). Calibrate all "${kind}" rows in one run, or pass --allow-partial-apply if this is intentional.`)
    }
  }

  if (typeof saved.grounded !== 'boolean' || typeof saved.retention !== 'boolean') die(`${FROM} is missing the grounded/retention booleans needed to derive simulator_method.`)
  const method = !saved.grounded ? 'ungrounded' : saved.retention ? 'grounded-retention' : 'grounded-full'
  if (!METHOD_ALLOWLIST.includes(method)) die(`Derived method "${method}" is not in ${JSON.stringify(METHOD_ALLOWLIST)} — db/005's CHECK would reject the write.`)
  if (!saved.model) die(`${FROM} has no "model" field.`)
  if (!Number.isInteger(saved.n) || saved.n < 1) die(`${FROM} has no valid "n" field.`)

  const bins = quintileDifficulty(joined.map((r) => r.p))
  joined.forEach((r, i) => { r.difficulty = bins[i] })
  const counts = [1, 2, 3, 4, 5].map((d) => joined.filter((r) => r.difficulty === d).length)

  console.log(`\nRe-applying ${FROM} (joined via ${ITEMS}): ${joined.length} item(s), model "${saved.model}", n=${saved.n}, method "${method}". No simulation run.`)
  console.log(`Distribution: ${counts.map((c, i) => `d${i + 1}=${c}`).join('  ')}`)
  if (DRY_RUN) {
    for (const r of [...joined].sort((a, b) => b.p - a.p)) console.log(`  difficulty ${r.difficulty}  p=${r.p.toFixed(2)}  ${r.id}  ${r.label}`)
    console.log(`\nsimulator_model=${saved.model}  simulator_method=${method}  simulated_n=${saved.n}`)
    console.log('\n--dry-run: nothing written to the database.')
    process.exit(0)
  }
  await sql.transaction(joined.map((r) => sql`
    update content_items
    set simulated_p = ${r.p}, simulated_n = ${saved.n}, simulator_model = ${saved.model},
        simulator_method = ${method}, difficulty = ${r.difficulty}
    where id = ${r.id}
  `))
  console.log(`Wrote ${joined.length} item(s) from the saved run.`)
  process.exit(0)
}

// FIX 1: the fresh-simulation path below only ever attempts kind='mcq' rows. `eligible` (above) still
// carries both kinds because the --from branch needs term_definition rows visible for its id-eligibility
// check -- but term rows have NULL stem/options/answer (50/50 in the live DB today), so simulating one
// here builds `{prompt: null, options: null, answer: null}`, `shuffled()` throws on `options.map(...)`,
// and simulateQuestion's catch silently miscounts it as a transport error -- with `errors` low enough to
// stay under budget, that item gets p=0.0 -> difficulty=5 written to the DB. Term items are simulated via
// the pre-rendered terms-mcq-clean.json fixture through --from instead (CLAUDE.md, "term items are
// calibratable after all", 1 Aug 2026) -- that stays the workflow, no rendering shim here.
const freshEligible = eligible.filter((r) => r.kind === 'mcq')
const excludedTermRows = eligible.length - freshEligible.length
if (excludedTermRows) console.log(`Excluding ${excludedTermRows} term_definition row(s) from the fresh-simulation path (calibrate those via --from + terms-mcq-clean.json instead).`)

if (!freshEligible.length) {
  console.log('Nothing to calibrate.')
  process.exit(0)
}

if (!MODEL_FLAG) die('--model is required for a fresh simulation run (the bake-off found simulator choice is item-type dependent — e.g. llama3.2:3b for slide MCQs, llama3.2:1b for term MCQs — so there is no safe default). The --from path reads the model from the saved run instead.')
const MODEL = MODEL_FLAG

// --- 2. simulate every eligible item (nothing is written yet) ---
const ask = makeAsker({ provider: 'ollama', model: MODEL })
const cohort = buildCohort(N)

console.log(`\nSimulating ${freshEligible.length} item(s) x ${cohort.length} student(s) on "${MODEL}" via Ollama (${METHOD})...`)

const results = []
let errors = 0
let unparseable = 0
for (let i = 0; i < freshEligible.length; i++) {
  const row = freshEligible[i]
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
  if (errors > cohort.length * 0.02 * freshEligible.length + 2) {
    console.error(`\nABORTING: ${errors} transport errors talking to Ollama. Writing nothing to the database.`)
    process.exit(1)
  }
  results.push({ id: row.id, p })
  console.log(`  [${String(i).padStart(2)}] ${(p * 100).toFixed(0).padStart(3)}%  ${row.id}  ${(row.stem ?? '').slice(0, 60)}`)
}
console.log(`\n${freshEligible.length} item(s) simulated, ${cohort.length * freshEligible.length} responses, ${unparseable} unparseable, ${errors} transport error(s).`)

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
