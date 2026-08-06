#!/usr/bin/env node
// Band stability between two calibration runs over the SAME items at the SAME --n, differing only
// in --seed-offset. Answers the question the adaptive-difficulty lever hinges on: if we redraw the
// simulated cohort, does an item keep its difficulty band?
//
// This is the operational reading of "does calibration work 80-90% of the time WITHOUT manual
// tagging". It measures RELIABILITY (same method, same items, fresh sample) and says nothing about
// VALIDITY (whether the band matches what students find hard) — only human response data settles
// that, and the literature expects r ~ 0.5 for management prose, not 0.8+.
//
// HARD PRECONDITION: the two runs must differ in --seed-offset. calibrate-difficulty.mjs seeds each
// simulated student from the item id, so two runs at the same offset are byte-identical and this
// script would report 100% by construction. It refuses to run in that case rather than print a
// reassuring number.
//
// Usage:
//   node scripts/analyse-band-stability.mjs run-a.json run-b.json [--json]

import { readFileSync } from 'node:fs'
import { exactAgreement, withinOneAgreement, cohenKappa, spearmanRho } from './lib/kappa.mjs'

const [pathA, pathB] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!pathA || !pathB) {
  console.error('Usage: node scripts/analyse-band-stability.mjs run-a.json run-b.json [--json]')
  process.exit(1)
}
const asJson = process.argv.includes('--json')

const load = (p) => {
  const raw = JSON.parse(readFileSync(p, 'utf8'))
  if (!raw.results) { console.error(`${p}: no "results" array — is this a calibrate-difficulty --out file?`); process.exit(1) }
  return raw
}
const A = load(pathA), B = load(pathB)

if (A.n !== B.n) { console.error(`Refusing: runs used different --n (${A.n} vs ${B.n}). Stability is only defined at a fixed n.`); process.exit(1) }
if (A.model !== B.model) { console.error(`Refusing: different models (${A.model} vs ${B.model}). That measures cross-simulator agreement, not stability.`); process.exit(1) }

// Pair on item id, never on array position — the two runs may order results differently.
const mapB = new Map(B.results.map((r) => [r.id, r]))
const paired = A.results.filter((r) => mapB.has(r.id)).map((r) => ({ id: r.id, a: r, b: mapB.get(r.id) }))
if (!paired.length) { console.error('Refusing: no item ids in common between the two runs.'); process.exit(1) }

const identicalP = paired.filter(({ a, b }) => a.p === b.p).length
if (identicalP === paired.length) {
  console.error(`Refusing: all ${paired.length} items have identical p in both runs.`)
  console.error('The runs are byte-identical, which means --seed-offset was the same (or omitted).')
  console.error('Re-run the second pass with a different --seed-offset; otherwise this reports 100% by construction.')
  process.exit(1)
}

const bandsA = paired.map(({ a }) => a.difficulty)
const bandsB = paired.map(({ b }) => b.difficulty)
const psA = paired.map(({ a }) => a.p)
const psB = paired.map(({ b }) => b.p)

const n = paired.length
const exact = exactAgreement(bandsA, bandsB)
const within1 = withinOneAgreement(bandsA, bandsB)
// cohenKappa returns { kappa, po, pe }, not a bare number — destructure it.
const { kappa } = cohenKappa(bandsA, bandsB, 5)
// spearmanRho returns NaN when one side has zero variance (e.g. every item at ceiling).
const rho = spearmanRho(psA, psB)
const fmt = (x) => (Number.isFinite(x) ? x.toFixed(3) : 'n/a (no variance)')
const moved = paired.filter(({ a, b }) => a.difficulty !== b.difficulty)
const bigMoves = moved.filter(({ a, b }) => Math.abs(a.difficulty - b.difficulty) >= 2)
// Items the simulator got right every time carry no ranking information at all; a stability figure
// that counts them is flattered by exactly the items the band-count analysis showed are useless.
const ceilinged = paired.filter(({ a, b }) => a.p >= 0.999 && b.p >= 0.999).length

const out = {
  runA: pathA, runB: pathB, model: A.model, n_simulated: A.n, items: n,
  exactBandAgreement: exact, withinOneBand: within1, cohenKappa: kappa, spearmanRhoOnP: rho,
  itemsMoved: moved.length, itemsMovedTwoOrMoreBands: bigMoves.length, itemsAtCeilingBothRuns: ceilinged,
}

if (asJson) { console.log(JSON.stringify(out, null, 2)); process.exit(0) }

console.log(`Band stability — ${A.model}, n=${A.n} simulated students, ${n} items`)
console.log(`  ${pathA}  vs  ${pathB}\n`)
console.log(`  EXACT same band:      ${(exact * 100).toFixed(1)}%   <-- the headline number`)
console.log(`  Within one band:      ${(within1 * 100).toFixed(1)}%`)
console.log(`  Cohen's kappa:        ${fmt(kappa)}   (chance-corrected; raw agreement flatters)`)
console.log(`  Spearman rho on p:    ${fmt(rho)}   (before binning — the underlying signal)`)
console.log(`\n  items that moved band:        ${moved.length} / ${n}`)
console.log(`  moved 2+ bands:               ${bigMoves.length}`)
console.log(`  at ceiling (p=1.00) in both:  ${ceilinged}${ceilinged ? '  <-- carry no ranking information' : ''}`)
if (moved.length) {
  console.log('\n  moved:')
  for (const { id, a, b } of moved.slice(0, 20)) {
    console.log(`    ${id.slice(0, 8)}  p ${a.p.toFixed(2)} -> ${b.p.toFixed(2)}   band ${a.difficulty} -> ${b.difficulty}`)
  }
  if (moved.length > 20) console.log(`    ... and ${moved.length - 20} more`)
}
console.log(`\nReliability only. This says nothing about whether a band matches what students find hard.`)
