#!/usr/bin/env node
// Item quality screen: measures each item instead of pattern-matching its text.
//
// Two ways an item is broken that string-matching validators keep missing (they only catch
// same-text-different-order cases, e.g. "Google's Market Share" vs "Market Share of Google"):
//   - TRIVIA / giveaway: answerable WITHOUT the source. High p_ungrounded.
//   - BROKEN / under-determined: not answerable even WITH the full source. Low p_grounded.
// A good item is low ungrounded, high grounded. gap = p_grounded - p_ungrounded IS the signal.
//
// Both arms run the SAME model (llama3.2, the 3B) so the gap is meaningful -- a stronger model in
// one arm would confound "knows the answer" with "is a stronger model". The grounded arm gets the
// FULL excerpt (--source, no --retention): this is deliberately the opposite of the difficulty
// pipeline, which thins the excerpt per ability tier to spread a gradient. Here the question is
// just "is this answerable with the material in front of you", so everyone gets everything, and
// ceiling in the grounded arm is GOOD, not disqualifying -- do not import the difficulty pipeline's
// discrimination criteria (mean .50-.65, <20% ceiling, ...); that is a different purpose.
//
// This script does NOT hard-code pass/fail thresholds. The first run's job is to show the
// distribution so thresholds get chosen from data -- it prints the distribution and sorts items by
// gap. --trivia-max and --broken-min are accepted for later use; if neither is passed, nothing gets
// classified, only reported.
//
// Usage:
//   node scripts/analyse-item-gap.mjs --ungrounded run-ungrounded.json --grounded run-grounded.json
//                                      --items items.json [--json out.json]
//                                      [--trivia-max 0.7] [--broken-min 0.3]

import { readFileSync, writeFileSync } from 'node:fs'
import { joinRunToItems } from './lib/join-run-to-items.mjs'

const USAGE = 'Usage: node scripts/analyse-item-gap.mjs --ungrounded run.json --grounded run.json --items items.json [--json out.json] [--trivia-max 0.7] [--broken-min 0.3]'
const die = (msg) => { console.error(`${msg}\n${USAGE}`); process.exit(1) }
const flag = (name, fallback = null) => {
  const i = process.argv.indexOf(name)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  if (!v || v.startsWith('--')) die(`${name} needs a value.`)
  return v
}

const UNGROUNDED = flag('--ungrounded')
const GROUNDED = flag('--grounded')
const ITEMS = flag('--items')
const JSON_OUT = flag('--json')
const TRIVIA_MAX = flag('--trivia-max') !== null ? Number(flag('--trivia-max')) : null
const BROKEN_MIN = flag('--broken-min') !== null ? Number(flag('--broken-min')) : null
if (!UNGROUNDED || !GROUNDED || !ITEMS) die('--ungrounded, --grounded and --items are all required.')
if (TRIVIA_MAX !== null && !Number.isFinite(TRIVIA_MAX)) die('--trivia-max must be a number.')
if (BROKEN_MIN !== null && !Number.isFinite(BROKEN_MIN)) die('--broken-min must be a number.')

const loadRun = (path) => {
  const run = JSON.parse(readFileSync(path, 'utf8'))
  if (!Array.isArray(run.rows)) die(`${path} has no "rows" array — is this a spike-simulate-difficulty.mjs run file?`)
  return run
}

const ungroundedRun = loadRun(UNGROUNDED)
const groundedRun = loadRun(GROUNDED)
const items = JSON.parse(readFileSync(ITEMS, 'utf8'))
if (!Array.isArray(items)) die(`${ITEMS} is not a JSON array of items.`)

// Sanity-check each arm was produced the way the design calls for -- passing the arms swapped, or a
// retention-thinned grounded run, would silently compute a gap that means something else entirely.
if (ungroundedRun.grounded !== false) die(`${UNGROUNDED} has grounded=${ungroundedRun.grounded} — the ungrounded arm must be run WITHOUT --source. Did you pass the arms in the wrong order?`)
if (groundedRun.grounded !== true) die(`${GROUNDED} has grounded=${groundedRun.grounded} — the grounded arm must be run WITH --source. Did you pass the arms in the wrong order?`)
if (groundedRun.retention !== false) die(`${GROUNDED} has retention=${groundedRun.retention} — the gap screen's grounded arm must use the FULL excerpt (--source without --retention), the opposite of the difficulty pipeline's thinning.`)
if (ungroundedRun.model !== groundedRun.model) die(`Arms used different models ("${ungroundedRun.model}" vs "${groundedRun.model}") — the gap is only meaningful when both arms use the same model.`)

let joinedU, joinedG
try {
  joinedU = joinRunToItems(ungroundedRun.rows, items, { runLabel: UNGROUNDED, itemsLabel: ITEMS })
  joinedG = joinRunToItems(groundedRun.rows, items, { runLabel: GROUNDED, itemsLabel: ITEMS })
} catch (err) {
  die(err.message)
}

// Both joins are against the SAME `items` array and both guard length + row order against it, so
// joinedU[i] and joinedG[i] refer to the same item by construction -- no separate id merge needed.
const rows = joinedU.map((u, i) => {
  const g = joinedG[i]
  return { id: u.id, label: u.label, p_ungrounded: u.p, p_grounded: g.p, gap: g.p - u.p }
})

// --- summary stats ---
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(q * (s.length - 1))]
}
const stats = (xs) => ({
  mean: mean(xs), median: median(xs),
  q1: quantile(xs, 0.25), q3: quantile(xs, 0.75),
  iqr: quantile(xs, 0.75) - quantile(xs, 0.25),
  min: Math.min(...xs), max: Math.max(...xs),
})
const fmt = (s) => `mean ${s.mean.toFixed(2)}  median ${s.median.toFixed(2)}  IQR ${s.iqr.toFixed(2)} [${s.q1.toFixed(2)}, ${s.q3.toFixed(2)}]  min ${s.min.toFixed(2)}  max ${s.max.toFixed(2)}`

const ungroundedStats = stats(rows.map((r) => r.p_ungrounded))
const groundedStats = stats(rows.map((r) => r.p_grounded))
const gapStats = stats(rows.map((r) => r.gap))

console.log(`ITEM GAP SCREEN — ${rows.length} item(s), model "${ungroundedRun.model}"`)
console.log(`  ungrounded (no source):    ${fmt(ungroundedStats)}`)
console.log(`  grounded (full source):    ${fmt(groundedStats)}`)
console.log(`  gap (grounded - ungrounded): ${fmt(gapStats)}`)

// --- histogram of the gap, [-1, 1] in bins of 0.2 ---
console.log('\nGAP HISTOGRAM (grounded - ungrounded; low/negative = worse item)')
const BIN_WIDTH = 0.2
const binCount = Math.round(2 / BIN_WIDTH)
const bins = Array(binCount).fill(0)
for (const r of rows) {
  const idx = Math.min(binCount - 1, Math.max(0, Math.floor((r.gap + 1) / BIN_WIDTH)))
  bins[idx]++
}
const maxBin = Math.max(...bins, 1)
for (let b = 0; b < binCount; b++) {
  const lo = (-1 + b * BIN_WIDTH).toFixed(1)
  const hi = (-1 + (b + 1) * BIN_WIDTH).toFixed(1)
  const bar = '#'.repeat(Math.round((bins[b] / maxBin) * 30))
  console.log(`  [${lo.padStart(5)}, ${hi.padStart(5)})  ${bar.padEnd(30)} ${bins[b]}`)
}

// --- per-item table, worst (lowest gap) first ---
console.log('\nPER ITEM, ascending by gap (worst first)')
console.log('  ' + 'gap'.padStart(6) + '  ' + 'ungr'.padStart(5) + '  ' + 'grnd'.padStart(5) + '  ' + 'id'.padEnd(34) + 'term/topic')
const sorted = [...rows].sort((a, b) => a.gap - b.gap)
for (const r of sorted) {
  console.log('  ' + r.gap.toFixed(2).padStart(6) + '  ' + r.p_ungrounded.toFixed(2).padStart(5) + '  ' + r.p_grounded.toFixed(2).padStart(5) + '  ' + r.id.padEnd(34) + r.label.slice(0, 60))
}

// --- optional classification, only when a threshold is supplied ---
if (TRIVIA_MAX !== null || BROKEN_MIN !== null) {
  console.log('\nCLASSIFICATION')
  if (TRIVIA_MAX !== null) {
    const trivia = rows.filter((r) => r.p_ungrounded > TRIVIA_MAX)
    console.log(`  TRIVIA (p_ungrounded > ${TRIVIA_MAX}): ${trivia.length}/${rows.length}`)
    for (const r of trivia) console.log(`    ${r.id}  ungrounded=${r.p_ungrounded.toFixed(2)}  ${r.label.slice(0, 60)}`)
  }
  if (BROKEN_MIN !== null) {
    const broken = rows.filter((r) => r.p_grounded < BROKEN_MIN)
    console.log(`  BROKEN (p_grounded < ${BROKEN_MIN}): ${broken.length}/${rows.length}`)
    for (const r of broken) console.log(`    ${r.id}  grounded=${r.p_grounded.toFixed(2)}  ${r.label.slice(0, 60)}`)
  }
} else {
  console.log('\nNo --trivia-max / --broken-min supplied: nothing classified, report only.')
}

if (JSON_OUT) {
  const out = {
    generated_at: new Date().toISOString(),
    model: ungroundedRun.model,
    ungrounded_file: UNGROUNDED,
    grounded_file: GROUNDED,
    items_file: ITEMS,
    thresholds: { trivia_max: TRIVIA_MAX, broken_min: BROKEN_MIN },
    stats: { ungrounded: ungroundedStats, grounded: groundedStats, gap: gapStats },
    items: sorted,
  }
  writeFileSync(JSON_OUT, JSON.stringify(out, null, 2))
  console.log(`\nWrote ${JSON_OUT}`)
}
