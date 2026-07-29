#!/usr/bin/env node
// Validate generated MCQ questions against the DSR pipeline rules, and for the
// passing set, fix the one mechanically-fixable problem: a skewed correct-answer
// index (real output put 8/15 correct answers at index 1). See db/schema.sql for
// the `questions` table this mirrors.
//
// Usage:
//   node scripts/validate-questions.mjs <questions.json> [--out clean.json] [--ignore-slides 1,26]
// Exit codes: 0 = every question passed, 2 = some were rejected, 1 = operational failure.

import { readFileSync, writeFileSync } from 'node:fs'

// A question leaks its source when it points at the document instead of standing
// alone. These are word-boundary regexes, not substrings: real output said
// "Based on the competitive landscape slide", which a plain "the slide" match
// misses. Matching the bare noun catches every adjective in between.
// Deliberately over-rejects: a wrongly-kept question corrupts the dataset,
// a wrongly-dropped one costs nothing. Keep this list flat and editable.
// "slide" is bare because it is the real offender and almost never legitimate
// subject matter. The rest are qualified: "figure" means a number in business
// prose ("which figure represents..."), "image" appears in "brand image", and
// bare matches on those killed good questions in testing.
const SOURCE_LEAK_PATTERNS = [
  /\bslides?\b/i, /\bthe decks?\b/i,
  /\b(the|this|that) (figure|diagram|image|template|presentation|chart)\b/i,
  /\b(figure|diagram|chart|table) (above|below|shown)\b/i,
  /\bshown above\b/i, /\bas shown\b/i, /\blisted in\b/i,
  /according to the examples provided/i,
]

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
const ignoreSlides = new Set((flag('--ignore-slides') ?? '').split(',').filter(Boolean).map((n) => {
  const v = Number(n)
  if (!Number.isInteger(v) || v <= 0) die(`--ignore-slides expects positive integers, got "${n}".`)
  return v
}))

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

// ---- checks: each returns null (pass) or { rule, quote } (reject) ----

function checkSelfContainment(q) {
  const opts = Array.isArray(q.options) ? q.options.filter((o) => typeof o === 'string') : []
  const text = [typeof q.prompt === 'string' ? q.prompt : '', ...opts].join(' \n ')
  for (const pattern of SOURCE_LEAK_PATTERNS) {
    const m = text.match(pattern)
    if (m) return { rule: 'self-containment', quote: text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 10).trim() }
  }
  return null
}

function checkShape(q) {
  if (typeof q.prompt !== 'string' || q.prompt.trim() === '')
    return { rule: 'shape', quote: 'prompt is empty or not a string' }
  if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some((o) => typeof o !== 'string' || o.trim() === ''))
    return { rule: 'shape', quote: 'options must be exactly 4 non-empty strings' }
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3)
    return { rule: 'shape', quote: `answer=${JSON.stringify(q.answer)}` }
  if (!Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 5)
    return { rule: 'shape', quote: `difficulty=${JSON.stringify(q.difficulty)}` }
  const format = q.format ?? 'plain' // mirrors the db column default when absent
  if (!['plain', 'latex', 'markdown'].includes(format))
    return { rule: 'shape', quote: `format=${JSON.stringify(q.format)}` }
  return null
}

function checkDuplicateOptions(q) {
  const seen = new Set()
  for (const o of q.options) {
    const key = o.trim().toLowerCase()
    if (seen.has(key)) return { rule: 'duplicate-options', quote: o }
    seen.add(key)
  }
  return null
}

function checkOptionLengthBalance(q) {
  const lens = q.options.map((o) => o.trim().length)
  const longest = Math.max(...lens)
  const shortest = Math.min(...lens)
  if (longest > shortest * 2.5)
    return { rule: 'option-length-balance', quote: `longest=${longest} chars, shortest=${shortest} chars` }
  return null
}

function checkProvenance(q, requireSlide) {
  if (!requireSlide) return null
  if (!Number.isInteger(q.slide) || q.slide <= 0) return { rule: 'provenance', quote: `slide=${JSON.stringify(q.slide)}` }
  if (ignoreSlides.has(q.slide)) return { rule: 'provenance', quote: `slide ${q.slide} is in --ignore-slides` }
  return null
}

// ---- deterministic seeded shuffle (fixes the answer-index skew) ----

function hashStr(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h >>> 0
}

function seededShuffle(arr, seed) {
  const a = arr.slice()
  let state = seed || 1 // xorshift32 would stick at 0 if seeded with 0
  const rand = () => {
    state ^= state << 13; state >>>= 0
    state ^= state >>> 17
    state ^= state << 5; state >>>= 0
    return state / 4294967296
  }
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function shuffleQuestion(q) {
  const correctText = q.options[q.answer]
  const shuffled = seededShuffle(q.options, hashStr(q.prompt))
  return { ...q, options: shuffled, answer: shuffled.indexOf(correctText) }
}

// ---- run the checks ----

const requireSlide = questions.some((q) => q && typeof q === 'object' && 'slide' in q)
const checks = [checkSelfContainment, checkShape, checkDuplicateOptions, checkOptionLengthBalance]
const passed = []
const rejected = []

questions.forEach((q, index) => {
  if (!q || typeof q !== 'object') { rejected.push({ index, rule: 'shape', quote: 'not an object' }); return }
  for (const check of checks) {
    const fail = check(q)
    if (fail) { rejected.push({ index, ...fail }); return }
  }
  const provenanceFail = checkProvenance(q, requireSlide)
  if (provenanceFail) { rejected.push({ index, ...provenanceFail }); return }
  passed.push(q)
})

for (const r of rejected) console.log(`[${r.index}] rejected (${r.rule}): ${r.quote}`)
console.log(`${passed.length} passed, ${rejected.length} rejected.`)

const fixed = passed.map(shuffleQuestion)
const dist = [0, 0, 0, 0]
for (const q of fixed) dist[q.answer]++
console.log(`Answer distribution after shuffle: A=${dist[0]} B=${dist[1]} C=${dist[2]} D=${dist[3]}`)

if (outPath) {
  writeFileSync(outPath, JSON.stringify(fixed, null, 2))
  console.log(`Wrote ${fixed.length} questions to ${outPath}`)
}

process.exit(rejected.length > 0 ? 2 : 0)
