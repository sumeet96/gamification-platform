#!/usr/bin/env node
// Research-methods spike, NOT a pipeline change: does cutting difficulty from 5 bands to 3 buy real
// (chance-corrected) agreement between simulator runs, or just cheaper chance agreement?
//
// CLAUDE.md's existing 5-over-10 argument is an SE argument: at n=30, SE on a facility proportion is
// ~0.09, so a 10-band width (~1/10 of the observed range) is roughly one SE wide -- false precision.
// The hypothesis tested here is that the SAME argument condemns 5 bands too, and that 3 would clear
// the noise floor where 5 does not.
//
// THE TRAP: raw agreement rises automatically as band count falls -- chance agreement is ~1/3 at 3
// bands vs ~1/5 at 5 -- so "3 bands agree more" is guaranteed by arithmetic and proves nothing on its
// own. Every agreement figure below is reported both raw and chance-corrected (Cohen's kappa,
// quadratic-weighted kappa). Does not modify scripts/lib/quintile-difficulty.mjs or any pipeline file.
//
// Usage: node scripts/analyse-band-count.mjs

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { quintileDifficulty } from './lib/quintile-difficulty.mjs'
import { tertileDifficulty } from './lib/tertile-difficulty.mjs'
import { exactAgreement, withinOneAgreement, cohenKappa, weightedKappaQuadratic, spearmanRho } from './lib/kappa.mjs'

const DIR = 'spike-data/'

function load(file) {
  const path = DIR + file
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Guard the same way scripts/lib/join-run-to-items.mjs guards an items join: two runs being
 *  compared must be the exact same item set in the exact same order, verified on content (prompt),
 *  not just length -- length-only agreement would silently compare item 7 in one run to a
 *  regenerated, different item 7 in the other. */
function assertAligned(a, b, labelA, labelB) {
  if (a.rows.length !== b.rows.length) {
    throw new Error(`${labelA} has ${a.rows.length} rows but ${labelB} has ${b.rows.length} -- not the same item set.`)
  }
  for (let i = 0; i < a.rows.length; i++) {
    if (a.rows[i].prompt !== b.rows[i].prompt) {
      throw new Error(`${labelA} row ${i} and ${labelB} row ${i} have different prompts -- runs are not aligned.`)
    }
  }
}

const ps = (run) => run.rows.map((r) => r.p)

// --- pair-level metrics: raw + chance-corrected agreement at 3 bands and at 5 ---
function pairMetrics(labelA, runA, labelB, runB) {
  assertAligned(runA, runB, labelA, labelB)
  const a = ps(runA), b = ps(runB)
  const n = a.length

  const band5A = quintileDifficulty(a), band5B = quintileDifficulty(b)
  const band3A = tertileDifficulty(a), band3B = tertileDifficulty(b)

  const at = (bandsA, bandsB, k) => {
    const exact = exactAgreement(bandsA, bandsB)
    const within1 = withinOneAgreement(bandsA, bandsB)
    const { kappa, po, pe } = cohenKappa(bandsA, bandsB, k)
    const { kappa: qwk } = weightedKappaQuadratic(bandsA, bandsB, k)
    return { exact, within1, po, pe, kappa, qwk }
  }

  return {
    labelA, labelB, n,
    spearman: spearmanRho(a, b),
    band5: at(band5A, band5B, 5),
    band3: at(band3A, band3B, 3),
  }
}

// --- single-dataset diagnostics: band occupancy + the resolvability arithmetic ---
function occupancy(bands, k) {
  const counts = Array(k).fill(0)
  for (const b of bands) counts[b - 1]++
  const empty = counts.filter((c) => c === 0).length
  const under3 = counts.filter((c) => c > 0 && c < 3).length
  return { counts, empty, under3 }
}

function resolvability(label, run) {
  const a = ps(run)
  const n = a.length
  const range = Math.max(...a) - Math.min(...a)
  const meanP = a.reduce((s, v) => s + v, 0) / n
  const se30 = Math.sqrt((meanP * (1 - meanP)) / 30)
  const resolvableDiff30 = 2 * Math.SQRT2 * se30
  const width3 = range / 3
  const width5 = range / 5
  // n at which a 5-band width sits exactly at the resolvable-difference threshold, i.e. the sample
  // size 5 bands would need to clear the same noise floor 3 bands is being checked against at n=30.
  // resolvableDiff(n) = resolvableDiff30 * sqrt(30/n)  =>  n = 30 * (resolvableDiff30 / width5)^2
  const nFor5BandsResolvable = width5 > 0 ? 30 * (resolvableDiff30 / width5) ** 2 : Infinity

  return {
    label, n, range, meanP, se30, resolvableDiff30, width3, width5,
    width3ClearsFloor: width3 >= resolvableDiff30,
    width5ClearsFloor: width5 >= resolvableDiff30,
    nFor5BandsResolvable,
    occupancy3: occupancy(tertileDifficulty(a), 3),
    occupancy5: occupancy(quintileDifficulty(a), 5),
  }
}

// --- dataset groups ---
const axisA = [
  ['termcal-llama3.2:1b (seed 1)', 'termcal-llama3-2-1b.json'],
  ['termcal-llama3.2:1b (posseed)', 'termcal-llama3-2-1b-posseed.json'],
]
const axisBTerm = [
  ['llama3.2:1b', 'termbake-llama3-2-1b.json'],
  ['qwen2.5:1.5b', 'termbake-qwen2-5-1-5b.json'],
  ['gemma2:2b', 'termbake-gemma2-2b.json'],
  ['llama3.2:3b', 'termbake-llama3-2.json'],
]
const axisBCage = [
  ['llama3.2:1b', 'bakeoff-llama3-2-1b.json'],
  ['qwen2.5:1.5b', 'bakeoff-qwen2-5-1-5b.json'],
  ['gemma2:2b', 'bakeoff-gemma2-2b.json'],
  ['llama3.2:3b', 'run-cage-llama-retention.json'],
  ['gemma2:9b', 'run-cage-gemma-retention.json'],
]

function loadGroup(group) {
  const loaded = []
  for (const [label, file] of group) {
    const run = load(file)
    if (!run) { console.log(`  (missing, skipped: ${file})`); continue }
    loaded.push({ label, file, run })
  }
  return loaded
}

function allPairs(loaded) {
  const pairs = []
  for (let i = 0; i < loaded.length; i++) {
    for (let j = i + 1; j < loaded.length; j++) {
      pairs.push([loaded[i], loaded[j]])
    }
  }
  return pairs
}

function fmtPct(x) { return (x * 100).toFixed(0) + '%' }
function fmtK(x) { return Number.isNaN(x) ? 'NaN' : x.toFixed(2) }

function printPairTable(title, pairs) {
  console.log('\n' + title)
  console.log('n=' + (pairs[0]?.n ?? '-') + ' per pair; kappa is chance-corrected, qwk additionally penalises being off by >1 band')
  console.log(
    'pair'.padEnd(46) + 'rho   ' +
    '| 3-band: exact  w/i1  pe    kappa  qwk   ' +
    '| 5-band: exact  w/i1  pe    kappa  qwk'
  )
  for (const m of pairs) {
    const pairLabel = `${m.labelA} vs ${m.labelB}`
    console.log(
      pairLabel.slice(0, 45).padEnd(46) +
      fmtK(m.spearman).padStart(5) + ' ' +
      '| ' + fmtPct(m.band3.exact).padStart(6) + fmtPct(m.band3.within1).padStart(6) +
      fmtK(m.band3.pe).padStart(7) + fmtK(m.band3.kappa).padStart(7) + fmtK(m.band3.qwk).padStart(7) + ' ' +
      '| ' + fmtPct(m.band5.exact).padStart(6) + fmtPct(m.band5.within1).padStart(6) +
      fmtK(m.band5.pe).padStart(7) + fmtK(m.band5.kappa).padStart(7) + fmtK(m.band5.qwk).padStart(7)
    )
  }
}

function analyseGroup(title, group) {
  const loaded = loadGroup(group)
  if (loaded.length < 2) { console.log(`\n${title}: fewer than 2 runs present, skipped.`); return { pairs: [], datasets: [] } }
  const pairs = allPairs(loaded).map(([x, y]) => pairMetrics(x.label, x.run, y.label, y.run))
  printPairTable(title, pairs)
  const datasets = loaded.map(({ label, run }) => resolvability(label, run))
  return { pairs, datasets }
}

console.log('='.repeat(100))
console.log('BAND-COUNT SPIKE: 3 bands vs 5 bands, raw AND chance-corrected agreement')
console.log('='.repeat(100))

const resAxisA = analyseGroup('AXIS A -- same-simulator reproducibility (llama3.2:1b, same 33 term items, differing only in RNG seed)', axisA)
const resTermBake = analyseGroup('AXIS B -- cross-simulator agreement, term MCQs (50 items, choose-word rendering)', axisBTerm)
const resCageBake = analyseGroup('AXIS B -- cross-simulator agreement, CAGE slide MCQs (17 items)', axisBCage)

// --- band occupancy + resolvability, per individual dataset ---
const allDatasets = [...resAxisA.datasets, ...resTermBake.datasets, ...resCageBake.datasets]

console.log('\n' + '='.repeat(100))
console.log('BAND OCCUPANCY -- how many bands are empty or hold <3 items, own-distribution quintile/tertile binning')
console.log('='.repeat(100))
console.log('dataset'.padEnd(34) + 'n   ' + '3-band counts'.padEnd(16) + 'empty/<3   ' + '5-band counts'.padEnd(22) + 'empty/<3')
for (const d of allDatasets) {
  console.log(
    d.label.slice(0, 33).padEnd(34) +
    String(d.n).padEnd(4) +
    `[${d.occupancy3.counts.join(',')}]`.padEnd(16) +
    `${d.occupancy3.empty}/${d.occupancy3.under3}`.padEnd(11) +
    `[${d.occupancy5.counts.join(',')}]`.padEnd(22) +
    `${d.occupancy5.empty}/${d.occupancy5.under3}`
  )
}

console.log('\n' + '='.repeat(100))
console.log('RESOLVABILITY -- observed facility range vs the n=30 noise floor (2*SE*sqrt(2))')
console.log('='.repeat(100))
console.log('dataset'.padEnd(34) + 'range  meanP  resolv.diff  width/3  clears3  width/5  clears5  n-for-5-bands')
for (const d of allDatasets) {
  console.log(
    d.label.slice(0, 33).padEnd(34) +
    d.range.toFixed(2).padEnd(7) +
    d.meanP.toFixed(2).padEnd(7) +
    d.resolvableDiff30.toFixed(3).padEnd(13) +
    d.width3.toFixed(3).padEnd(9) +
    (d.width3ClearsFloor ? 'yes' : 'NO').padEnd(9) +
    d.width5.toFixed(3).padEnd(9) +
    (d.width5ClearsFloor ? 'yes' : 'NO').padEnd(9) +
    (Number.isFinite(d.nFor5BandsResolvable) ? Math.ceil(d.nFor5BandsResolvable) : 'inf')
  )
}

console.log('\nCAVEATS:')
console.log('  - n=33 (term) and n=17 (CAGE) items is a small base for kappa; treat single-pair kappas as')
console.log('    indicative, not precise -- do not report a kappa to more than one decimal in the paper.')
console.log('  - Every number here is simulator-vs-simulator agreement, not simulator-vs-human. empirical_p')
console.log('    is null on every content_items row; nothing here is a claim about real students.')
console.log('  - Axis A (same model, two seeds) is the cleanest signal -- it is measuring pure RNG noise,')
console.log('    not a genuine model disagreement, so it is the best-case bound on any binning scheme.')

// --- write the JSON artifact ---
const report = {
  generatedAt: new Date().toISOString(),
  note: 'Research-methods spike output. Not consumed by any pipeline. See CLAUDE.md band-count discussion.',
  axisA: resAxisA.pairs,
  axisBTerm: resTermBake.pairs,
  axisBCage: resCageBake.pairs,
  occupancy: allDatasets.map((d) => ({
    label: d.label, n: d.n,
    band3: d.occupancy3, band5: d.occupancy5,
  })),
  resolvability: allDatasets.map((d) => ({
    label: d.label, n: d.n, range: d.range, meanP: d.meanP,
    se30: d.se30, resolvableDiff30: d.resolvableDiff30,
    width3: d.width3, width5: d.width5,
    width3ClearsFloor: d.width3ClearsFloor, width5ClearsFloor: d.width5ClearsFloor,
    nFor5BandsResolvable: d.nFor5BandsResolvable,
  })),
}
writeFileSync(DIR + 'band-count-report.json', JSON.stringify(report, null, 2))
console.log(`\nWrote ${DIR}band-count-report.json`)
