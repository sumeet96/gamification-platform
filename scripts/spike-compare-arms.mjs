#!/usr/bin/env node
// Compare simulation arms from spike-simulate-difficulty.mjs on the same item set.
//
// The question this answers: does giving the simulated student the source material change what
// gets measured? Ungrounded, a high success rate means "answerable without the deck". Grounded,
// it should mean "easy for someone who attended". Those are different quantities and the
// comparison is the evidence for which one we are actually estimating.
//
// Usage:
//   node scripts/spike-compare-arms.mjs <run-A.json> <run-B.json> [run-C.json ...]

import { readFileSync } from 'node:fs'

const paths = process.argv.slice(2)
if (paths.length < 2) { console.error('Usage: node scripts/spike-compare-arms.mjs <runA.json> <runB.json> [...]'); process.exit(1) }
const arms = paths.map((p) => JSON.parse(readFileSync(p, 'utf8')))
const n = arms[0].rows.length
if (arms.some((a) => a.rows.length !== n)) { console.error('Arms have different item counts; they must be the same set.'); process.exit(1) }

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Spearman rank correlation, average ranks for ties. Rank-based because we only ever use the
 *  ordering (quintile binning), never the raw magnitude. */
function spearman(a, b) {
  const rank = (xs) => {
    const idx = xs.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v)
    const r = Array(xs.length)
    for (let i = 0; i < idx.length;) {
      let j = i
      while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++
      const avg = (i + j) / 2 + 1
      for (let k = i; k <= j; k++) r[idx[k].i] = avg
      i = j + 1
    }
    return r
  }
  const ra = rank(a), rb = rank(b)
  const ma = mean(ra), mb = mean(rb)
  let num = 0, da = 0, db = 0
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

// --- per-arm summary ---
console.log('ARM SUMMARY')
console.log('  ' + 'arm'.padEnd(20) + 'mean   min    max    spread  sd     n_resp  unparse  time')
for (const a of arms) {
  const ps = a.rows.map((r) => r.p)
  const sd = Math.sqrt(mean(ps.map((p) => (p - mean(ps)) ** 2)))
  console.log('  ' + a.label.padEnd(20)
    + mean(ps).toFixed(2).padEnd(7) + Math.min(...ps).toFixed(2).padEnd(7) + Math.max(...ps).toFixed(2).padEnd(7)
    + (Math.max(...ps) - Math.min(...ps)).toFixed(2).padEnd(8) + sd.toFixed(2).padEnd(7)
    + String(a.n * n).padEnd(8) + String(a.unparseable).padEnd(9) + `${(a.seconds / 60).toFixed(0)}m`)
}

// --- ability slope: the sanity check that the personas do anything at all ---
console.log('\nABILITY SLOPE (mean success by tier — flat means the personas are decorative)')
const tiers = Object.keys(arms[0].rows[0].byTier ?? {})
if (tiers.length) {
  console.log('  ' + 'arm'.padEnd(20) + tiers.map((t) => t.padEnd(14)).join('') + 'slope')
  for (const a of arms) {
    const vals = tiers.map((t) => mean(a.rows.map((r) => r.byTier[t] ?? 0)))
    console.log('  ' + a.label.padEnd(20) + vals.map((v) => (v * 100).toFixed(0).padEnd(14)).join('')
      + `${((vals[vals.length - 1] - vals[0]) * 100).toFixed(0)} pts`)
  }
} else {
  console.log('  (no per-tier data — rerun the arms with the current script)')
}

// --- agreement between arms, and against the asserted labels ---
console.log('\nRANK AGREEMENT (Spearman)')
for (let i = 0; i < arms.length; i++) {
  for (let j = i + 1; j < arms.length; j++) {
    console.log(`  ${arms[i].label} vs ${arms[j].label}: ${spearman(arms[i].rows.map((r) => r.p), arms[j].rows.map((r) => r.p)).toFixed(2)}`)
  }
}
const asserted = arms[0].rows.map((r) => r.asserted ?? 0)
if (asserted.some((x) => x)) {
  console.log('\n  vs the model-asserted 1-5 labels (expect near zero — those labels do not discriminate;')
  console.log('  success falls as difficulty rises, so a working estimate correlates NEGATIVELY):')
  for (const a of arms) console.log(`    ${a.label.padEnd(20)} ${spearman(a.rows.map((r) => r.p), asserted).toFixed(2)}`)
}

// --- per item ---
console.log('\nPER ITEM')
console.log('  ' + '#'.padEnd(4) + 'lbl '.padEnd(5) + arms.map((a) => a.label.slice(0, 10).padEnd(12)).join('') + 'topic')
for (let i = 0; i < n; i++) {
  console.log('  ' + String(i).padEnd(4) + `d${arms[0].rows[i].asserted ?? '?'}`.padEnd(5)
    + arms.map((a) => `${(a.rows[i].p * 100).toFixed(0)}%`.padEnd(12)).join('')
    + (arms[0].rows[i].topic ?? '').slice(0, 30))
}

// --- what this is for: which items survive as usable ---
const last = arms[arms.length - 1]
const ceiling = last.rows.filter((r) => r.p >= 0.95)
const floor = last.rows.filter((r) => r.p <= 0.05)
console.log(`\nIN "${last.label}": ${ceiling.length}/${n} at ceiling (>=95%), ${floor.length}/${n} at floor (<=5%).`)
console.log('Items at ceiling carry no difficulty information and cannot be placed in a band.')
if (arms.length > 1) {
  const first = arms[0]
  const stillEasy = last.rows.filter((r) => r.p >= 0.95 && first.rows[r.i].p >= 0.95)
  console.log(`${stillEasy.length}/${n} are at ceiling in BOTH "${first.label}" and "${last.label}" —`)
  console.log('those are answerable without the deck at all, which is a question-quality defect, not a difficulty reading:')
  for (const r of stillEasy) console.log(`  [${r.i}] ${r.prompt.slice(0, 84)}`)
}
