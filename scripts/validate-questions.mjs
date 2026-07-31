#!/usr/bin/env node
// Thin CLI over scripts/lib/questions-validate.mjs. The rules live in the module so the generator
// imports the same guard rather than re-implementing a weaker one
// (docs/architecture/generator-spec.md, "The mandatory guard").
//
// Usage:
//   node scripts/validate-questions.mjs <questions.json> [--out clean.json] [--ignore-slides 1,26]
// Exit codes: 0 = every question passed, 2 = some were rejected, 1 = operational failure.

import { readFileSync, writeFileSync } from 'node:fs'
import { validateQuestions, answerDistribution } from './lib/questions-validate.mjs'

const USAGE = 'Usage: node scripts/validate-questions.mjs <questions.json> [--out clean.json] [--ignore-slides 1,26]'
const die = (msg) => { console.error(`${msg}\n${USAGE}`); process.exit(1) }

// A flag with a missing value must fail loudly: `--out` with nothing after it
// used to silently write no file and still exit 0.
const flag = (name) => {
  const i = process.argv.indexOf(name)
  if (i === -1) return null
  const value = process.argv[i + 1]
  if (!value || value.startsWith('--')) die(`${name} needs a value.`)
  return value
}

const inPath = process.argv[2]
if (!inPath || inPath.startsWith('--')) die('Missing <questions.json>.')
const outPath = flag('--out')
const ignoreSlides = (flag('--ignore-slides') ?? '').split(',').filter(Boolean).map((n) => {
  const v = Number(n)
  if (!Number.isInteger(v) || v <= 0) die(`--ignore-slides expects positive integers, got "${n}".`)
  return v
})

let questions
try {
  questions = JSON.parse(readFileSync(inPath, 'utf8'))
} catch (err) {
  console.error(`Could not read/parse ${inPath}: ${err.message}`)
  process.exit(1)
}
if (!Array.isArray(questions)) {
  console.error(`${inPath} must contain a JSON array of questions.`)
  process.exit(1)
}

const { passed, rejected } = validateQuestions(questions, { ignoreSlides })

for (const r of rejected) console.log(`[${r.index}] rejected (${r.rule}): ${r.quote}`)
console.log(`${passed.length} passed, ${rejected.length} rejected.`)

const dist = answerDistribution(passed)
console.log(`Answer distribution after shuffle: A=${dist[0]} B=${dist[1]} C=${dist[2]} D=${dist[3]}`)

if (outPath) {
  writeFileSync(outPath, JSON.stringify(passed, null, 2))
  console.log(`Wrote ${passed.length} questions to ${outPath}`)
}

process.exit(rejected.length > 0 ? 2 : 0)
