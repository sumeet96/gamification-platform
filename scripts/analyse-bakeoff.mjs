#!/usr/bin/env node
// Regenerates the simulator bake-off tables from spike-data/*.json.
//
// The criterion is DISCRIMINATION, not weakness. "Weaker models simulate students
// better" is directionally right but is not what has actually broken runs in this
// project -- CEILING is. An item a simulator scores ~1.0 carries no ranking
// information, which is what collapsed the Thoughtworks case to 8 usable items of 19
// and made its cross-simulator rho meaningless.
//
//   mean facility .50-.65 | ceiling <20% | floor <10% | monotonic gradient | IQR >.30
//
// The monotonic-gradient check is the guard against going TOO small: a model
// answering near chance (0.25 on four options) has a flattering low mean and no
// ability signal at all. It is the only criterion that catches that failure mode.
//
// RESULT (1 Aug 2026): there is no single winner. The same model, same method,
// same n, goes from 2/17 items at ceiling on slide MCQs to 31/50 on term MCQs.
// llama3.2:3b is the best simulator for conceptual slide MCQs and unusable for
// term items; llama3.2:1b is exactly the reverse. Simulator choice is ITEM-TYPE
// dependent -- 3B for the quiz, 1B for match and choose-the-right-word.
//
// Usage: node scripts/analyse-bakeoff.mjs

import { readFileSync, existsSync } from 'node:fs'

const CEIL = 0.95
const FLOOR = 0.05
const quantile = (sorted, k) => sorted[Math.floor(k * (sorted.length - 1))]

/** Summarise one run against the five criteria. Returns null if it has not run. */
function summarise(label, file) {
  const path = 'spike-data/' + file
  if (!existsSync(path)) return null
  const r = JSON.parse(readFileSync(path, 'utf8'))
  const ps = r.rows.map((x) => x.p).sort((a, b) => a - b)
  const n = ps.length
  const mean = ps.reduce((s, v) => s + v, 0) / n
  const iqr = quantile(ps, 0.75) - quantile(ps, 0.25)
  const ceil = ps.filter((v) => v >= CEIL).length
  const floor = ps.filter((v) => v <= FLOOR).length

  const tiers = Object.keys(r.rows[0].byTier)
  const gradient = tiers.map((t) => {
    const v = r.rows.map((x) => x.byTier[t]).filter((x) => typeof x === 'number')
    return v.reduce((s, x) => s + x, 0) / v.length
  })
  // Tolerance of 0.005 so floating-point noise is not read as an inversion.
  let mono = true
  for (let i = 1; i < gradient.length; i++) if (gradient[i] < gradient[i - 1] - 0.005) mono = false

  const criteria = [
    mean >= 0.5 && mean <= 0.65,
    ceil / n < 0.2,
    floor / n < 0.1,
    mono,
    iqr > 0.3,
  ]
  return { label, n, mean, iqr, ceil, floor, gradient, mono, criteria, mins: Math.round((r.seconds || 0) / 60) }
}

function table(title, note, runs) {
  console.log(title)
  if (note) console.log(note)
  console.log('')
  console.log('model             mean   IQR   ceil  floor   gradient (BB/Bas/Prof/Adv)      mono  mins  criteria')
  for (const [label, file] of runs) {
    const d = summarise(label, file)
    if (!d) {
      console.log(label.padEnd(17), '  - not present -')
      continue
    }
    console.log(
      d.label.padEnd(17),
      d.mean.toFixed(2).padStart(5),
      d.iqr.toFixed(2).padStart(5),
      (d.ceil + '/' + d.n).padStart(6),
      (d.floor + '/' + d.n).padStart(6),
      '  ' + d.gradient.map((x) => x.toFixed(2)).join(' / ').padEnd(28),
      (d.mono ? 'yes' : 'NO ').padStart(4),
      String(d.mins).padStart(5),
      '  ' + d.criteria.map((p) => (p ? '+' : '.')).join('')
    )
  }
  console.log('')
}

table(
  'SLIDE-MCQ ARM - CAGE deck, 17 items x 30 simulated students, grounded + retention-gated',
  '* = pre-existing run on the same deck/arm/n, reused as a control rather than repeated',
  [
    ['llama3.2:1b', 'bakeoff-llama3-2-1b.json'],
    ['qwen2.5:1.5b', 'bakeoff-qwen2-5-1-5b.json'],
    ['gemma2:2b', 'bakeoff-gemma2-2b.json'],
    ['llama3.2:3b *', 'run-cage-llama-retention.json'],
    ['gemma2:9b *', 'run-cage-gemma-retention.json'],
  ]
)

table(
  'TERM-MCQ ARM - 50 term items rendered as choose-word MCQs, 30 students, grounded + retention-gated',
  'Built by scripts/build-term-mcq-spike.mjs: clue as stem, term + 3 distractors as options.',
  [
    ['llama3.2:1b', 'termbake-llama3-2-1b.json'],
    ['qwen2.5:1.5b', 'termbake-qwen2-5-1-5b.json'],
    ['gemma2:2b', 'termbake-gemma2-2b.json'],
    ['llama3.2:3b', 'termbake-llama3-2.json'],
  ]
)

console.log('criteria order: [mean .50-.65] [ceiling <20%] [floor <10%] [monotonic gradient] [IQR >.30]')
