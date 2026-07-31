// Validation rules for generated MCQs, as an importable module.
//
// This was CLI-only (`scripts/validate-questions.mjs`, top-level argv + process.exit), which made
// "nothing reaches the database unvalidated" a convention someone could forget. The generator now
// imports `validateQuestions` directly, so the guard is structural
// (`docs/architecture/generator-spec.md`, "The mandatory guard").
//
// Moved code. The rules, the regexes, the shuffle and the pass/reject decisions are unchanged.

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
export const SOURCE_LEAK_PATTERNS = [
  /\bslides?\b/i, /\bthe decks?\b/i,
  /\b(the|this|that) (figure|diagram|image|template|presentation|chart)\b/i,
  /\b(figure|diagram|chart|table) (above|below|shown)\b/i,
  /\bshown above\b/i, /\bas shown\b/i, /\blisted in\b/i,
  /according to the examples provided/i,
]

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

// `page` is the honest name for the provenance unit and is what the generator emits
// (generator-spec.md, "Input is PDF"). `slide` is still accepted so pre-existing batches validate
// unchanged; the reject message quotes whichever field the batch actually used.
function checkProvenance(q, ignoreSlides) {
  const field = 'page' in q ? 'page' : 'slide'
  const value = q[field]
  if (!Number.isInteger(value) || value <= 0) return { rule: 'provenance', quote: `${field}=${JSON.stringify(value)}` }
  if (ignoreSlides.has(value)) return { rule: 'provenance', quote: `${field} ${value} is in --ignore-slides` }
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

/**
 * Validate a batch of generated questions.
 *
 * Provenance is only checked when at least one question carries a `slide` field — matching the
 * original CLI, which inferred the requirement from the data rather than a flag. A batch with no
 * slide numbers at all is a pre-provenance batch, not a batch that failed provenance.
 *
 * @returns {{ passed: object[], rejected: {index:number, rule:string, quote:string}[] }}
 *   `passed` is shuffled; `rejected` carries the original index so callers can report on it.
 */
export function validateQuestions(questions, { ignoreSlides = [] } = {}) {
  if (!Array.isArray(questions)) throw new TypeError('validateQuestions expects an array')
  const ignore = ignoreSlides instanceof Set ? ignoreSlides : new Set(ignoreSlides)
  const requireSlide = questions.some((q) => q && typeof q === 'object' && ('slide' in q || 'page' in q))
  const checks = [checkSelfContainment, checkShape, checkDuplicateOptions, checkOptionLengthBalance]
  const passed = []
  const rejected = []

  questions.forEach((q, index) => {
    if (!q || typeof q !== 'object') { rejected.push({ index, rule: 'shape', quote: 'not an object' }); return }
    for (const check of checks) {
      const fail = check(q)
      if (fail) { rejected.push({ index, ...fail }); return }
    }
    if (requireSlide) {
      const provenanceFail = checkProvenance(q, ignore)
      if (provenanceFail) { rejected.push({ index, ...provenanceFail }); return }
    }
    passed.push(q)
  })

  return { passed: passed.map(shuffleQuestion), rejected }
}

/** Answer-index distribution, the check that the shuffle actually de-skewed the batch. */
export function answerDistribution(questions) {
  const dist = [0, 0, 0, 0]
  for (const q of questions) dist[q.answer]++
  return dist
}
