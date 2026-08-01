// Validation rules for generated term_definition primitives, as an importable module.
//
// Package G2 (docs/PROJECT_MAP.md §3 K-1). Mirrors scripts/lib/questions-validate.mjs in shape
// and intent — the generator imports validateTerms so "nothing reaches the database unvalidated"
// is structural, not a convention. The checks themselves are different: an MCQ is broken by a bad
// answer index, a term_definition item is broken by leaking its own answer into the clue or the
// example sentence, since five games (crossword, word search, match, fill-in-the-blanks,
// choose-the-right-word) all read the same row and every one of them can be spoiled that way.

import { SOURCE_LEAK_PATTERNS } from './questions-validate.mjs'
// FIX 6: reused, not reinvented -- this is the exact same case/punctuation-
// insensitive comparison app/api/word/answer/route.ts's scoring (matchesTerm,
// lib/games/match.ts) uses to accept a `variants` entry as correct. A distractor
// that normalises the same as a declared variant would therefore score as
// correct too, making the "wrong" option a second right answer. Verified
// importable from a .mjs script under this project's Node version (native TS
// stripping) -- see the module boundary note on checkDistractors below if that
// ever stops being true.
import { normaliseTerm } from '../../lib/games/match.ts'

// A "short phrase" limit, chosen so real terms ("digital transformation", "network effects",
// "return on investment") pass and a runaway sentence does not. Stated here rather than left
// implicit, per the brief.
const TERM_MAX_WORDS = 5
const TERM_MAX_CHARS = 40

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Crude but deliberate: strip common suffixes so "automate" and "automation" are recognised as the
// same root. Over-catching here is the safe failure mode (a wrongly-rejected clue costs nothing; a
// wrongly-kept leaking clue spoils the item for every game that reads it).
function stem(word) {
  return word.toLowerCase().replace(/(ing|ies|ied|es|ed|s)$/, '')
}

/** True if `text` contains `term` itself or an obvious morphological variant of one of its words. */
function leaksTerm(text, term) {
  const haystack = text.toLowerCase()
  const words = term.toLowerCase().split(/\s+/).filter(Boolean)
  // The whole term as a phrase, verbatim — catches multi-word terms a per-word stem check would miss.
  if (words.length > 1) {
    const phrase = new RegExp(`\\b${escapeRegex(words.map(escapeRegex).join('\\s+'))}`, 'i')
    if (phrase.test(haystack)) return true
  }
  const hits = (w) => {
    if (w.length < 3) return false // "a", "of", "an" etc. would over-match every clue
    return new RegExp(`\\b${escapeRegex(stem(w))}\\w*`, 'i').test(haystack)
  }

  // A SINGLE-WORD term leaks if the clue contains it or an inflection: a clue for "Inception"
  // saying "inceptions" gives the answer away.
  if (words.length === 1) return hits(words[0])

  // A MULTI-WORD term only leaks if the clue contains EVERY content word. Checking each word
  // independently rejected 5 of 8 items on the first real run -- a clue for "Minimum Viable
  // Product" was killed for containing the ordinary word "product", and one for a Tengfei Group
  // term for containing "group". That is not a leak, it is English, and it suppressed the yield
  // of a 15-page case down to two pages. Requiring all content words keeps the real giveaway
  // ("the minimum viable product released first") while allowing a clue to use one common
  // component noun.
  return words.every((w) => w.length < 3 || hits(w))
}

// Fix 1, found by playing the game rather than by a test (2 Aug 2026): checkClueLeak only
// compares the clue against ITS OWN term, so a clue that names a distractor-free detail (a
// country, a year) sails through without containing the term verbatim or in full. Real item:
// clue "Top toy companies by market share in the United States as of 2022" next to term
// "Leading Toy Brands USA" -- "toy" is shared but also sits in every distractor, so it is not a
// giveaway; "USA"/"United States" is shared and sits in NO distractor, so a student answers on
// that one token alone, no material required. 15 of 50 live rows had this shape.
//
// Stopwords so a clue's "of"/"in"/"the" never counts as a shared content word.
const STOPWORDS = new Set([
  'the', 'a', 'of', 'in', 'to', 'for', 'and', 'or', 'as', 'by', 'on', 'is', 'are',
  'it', 'its', 'that', 'this', 'with', 'from', 'at', 'be',
])

// Known-incomplete on purpose, per the brief: a short list, not a synonym engine. Canonical
// spelling is each group's first entry; add a group only when a real miss turns up.
const SYNONYM_GROUPS = [
  ['usa', 'united states', 'us', 'america'],
  ['uk', 'united kingdom', 'britain'],
  ['eu', 'european union', 'europe'],
]
// Flattened to (phrase -> canonical) pairs, longest phrase first so "united states" is matched
// before a bare "united" or "states" ever could be.
const SYNONYM_REPLACEMENTS = SYNONYM_GROUPS
  .flatMap(([canon, ...rest]) => rest.map((phrase) => [phrase, canon]))
  .sort((a, b) => b[0].length - a[0].length)

/** Normalise the way scoring does (reused `normaliseTerm`), fold known country synonyms to one
 *  spelling, strip stopwords, then stem (reused `stem`) so "statistics" and "statistic" count as
 *  the same content word. Returns a Set of tokens. */
function contentTokens(text) {
  let s = normaliseTerm(text)
  for (const [phrase, canon] of SYNONYM_REPLACEMENTS) {
    s = s.replace(new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'g'), canon)
  }
  const words = s.split(' ').filter(Boolean)
  return new Set(words.filter((w) => !STOPWORDS.has(w)).map(stem))
}

// Operates on the FULL OPTION SET (term + distractors), not the term alone: a clue word that
// picks the correct term out from among its own distractors is answerable by keyword matching
// with zero knowledge of the material, even though it never leaks the term text itself.
//
// Fix 3 (2 Aug 2026): this is a DETECTOR ONLY. It used to also BE the remedy — validateTerms
// rejected the whole item on a hit — and that rejected real items ("Minimum Viable Products" on
// "products", "Story Wall" on "story", "User story cards" on "card"): you cannot define a term
// without using words related to it, so the clue sharing a content word with the term is normal,
// not a defect. The defect proven by the one item that DID survive ("Thin Slice teams", saved by
// its own distractor "Integrated teams" also containing "teams") is that the giveaway lives in the
// DISTRACTOR SET, not the item — a shared token stops being a giveaway the moment a distractor
// carries it too. The fix belongs in generate-terms.mjs (repair the distractors, one retry) and in
// validateTerms below (bucket a pure giveaway hit as `repairable`, not `rejected`); this function's
// job stays exactly what it was, decide whether the hit exists. `token` is returned explicitly (not
// just embedded in `quote`) so the repair prompt can name it without re-parsing a sentence.
function checkOptionSetGiveaway(item) {
  const clueTokens = contentTokens(item.clue)
  const termTokens = contentTokens(item.term)
  const distractorTokenSets = item.distractors.map(contentTokens)
  for (const token of clueTokens) {
    if (!termTokens.has(token)) continue
    if (!distractorTokenSets.some((set) => set.has(token)))
      return {
        rule: 'option-set-giveaway',
        token,
        quote: `clue shares "${token}" with term "${item.term}" but no distractor does (clue="${item.clue}")`,
      }
  }
  return null
}

// Fix 2: reject terms that are exhibit/chart captions rather than concepts a student could
// learn -- "Leading Toy Brands USA", "Netflix Subscribers Statistics 2025", "Mattel Japan Market
// Share" are slide titles lifted as vocabulary, not terms of art. Narrow on purpose: these three
// endings (country, year, metric word) are what the real bad rows have in common, and legitimate
// multi-word management terms ("Minimum Viable Product", "Lean and Agile Delivery Model", "Story
// Wall") end in none of them. Known-incomplete heuristic, same spirit as the synonym list above --
// a term like "Digital India" would false-positive; watch yield rather than trusting it blind.
const CHART_TITLE_ENDING = new RegExp(
  '\\b(' +
    [
      'USA', 'US', 'UK', 'EU', 'United States', 'United Kingdom', 'European Union',
      'India', 'China', 'Japan', 'Europe', 'America', 'Britain', 'Germany', 'France',
      'Canada', 'Australia',
      'Market Share', 'Statistics', 'Subscribers', 'Revenue', 'Growth Rate',
      'Sales Figures', 'Adoption Rate',
    ]
      .map(escapeRegex)
      .join('|') +
    ')$',
  'i'
)
const CHART_TITLE_YEAR = /\b(19|20)\d{2}$/

function checkChartTitle(item) {
  const term = item.term.trim()
  if (CHART_TITLE_YEAR.test(term) || CHART_TITLE_ENDING.test(term))
    return { rule: 'chart-title-term', quote: `term="${term}" reads like a chart/exhibit caption, not a concept` }
  return null
}

// ---- checks: each returns null (pass) or { rule, quote } (reject) ----

function checkShape(item) {
  if (typeof item.term !== 'string' || item.term.trim() === '')
    return { rule: 'shape', quote: 'term is empty or not a string' }
  const term = item.term.trim()
  if (term.length > TERM_MAX_CHARS || term.split(/\s+/).length > TERM_MAX_WORDS)
    return { rule: 'shape', quote: `term="${term}" exceeds ${TERM_MAX_WORDS} words / ${TERM_MAX_CHARS} chars` }
  if (typeof item.clue !== 'string' || item.clue.trim() === '')
    return { rule: 'shape', quote: 'clue is empty or not a string' }
  if (item.example_sentence !== null && typeof item.example_sentence !== 'string')
    return { rule: 'shape', quote: `example_sentence=${JSON.stringify(item.example_sentence)}` }
  if (item.example_sentence !== null && item.example_sentence.trim() === '')
    return { rule: 'shape', quote: 'example_sentence is an empty string; use null instead' }
  if (!Array.isArray(item.variants) || item.variants.some((v) => typeof v !== 'string'))
    return { rule: 'shape', quote: `variants=${JSON.stringify(item.variants)}` }
  if (!Array.isArray(item.distractors) || item.distractors.some((d) => typeof d !== 'string'))
    return { rule: 'shape', quote: `distractors=${JSON.stringify(item.distractors)}` }
  if (!['recall', 'apply', 'discriminate', 'deduce', 'transfer'].includes(item.cognitive_level))
    return { rule: 'shape', quote: `cognitive_level=${JSON.stringify(item.cognitive_level)}` }
  return null
}

// The clue is read by three games (crossword clue, match-the-following target, Wordle hint) — if it
// contains the term, every one of them leaks its own answer.
function checkClueLeak(item) {
  if (leaksTerm(item.clue, item.term))
    return { rule: 'clue-leaks-term', quote: item.clue }
  return null
}

// fill-in-the-blanks blanks out the term from this sentence. If the term is not actually in it,
// there is nothing to blank.
function checkExampleContainsTerm(item) {
  if (item.example_sentence === null) return null
  const escaped = escapeRegex(item.term.trim())
  const re = new RegExp(`\\b${escaped}\\b`, 'i')
  if (!re.test(item.example_sentence))
    return { rule: 'example-missing-term', quote: item.example_sentence }
  return null
}

// Distractors must be plausible-but-wrong. A distractor identical to the term makes the item
// unanswerable; a repeated distractor is a wasted slot at best and a giveaway at worst (only one
// choice left standing in choose-the-right-word or match-the-following).
//
// FIX 6: also reject a distractor that normalises to any declared VARIANT, not just the term
// itself. "Minimum Viable Product" with variants=["MVP"] and a distractor "MVP" used to pass --
// "mvp" !== "minimum viable product" -- but scoring (matchesTerm) accepts variants as correct, so
// choose-the-right-word would offer "MVP" as a clickable wrong answer that actually scores right.
// Harmless in match (free-text entry never offers the variant as a temptation); newly exposed by
// A3's clickable options. Uses normaliseTerm (imported above) for the variant comparison
// specifically, since that is the SAME normalisation scoring applies -- the term/duplicate checks
// below keep their original simple lowercase-trim comparison, unchanged, to avoid widening what
// this function already rejected before today.
function checkDistractors(item) {
  const term = item.term.trim().toLowerCase()
  const variantKeys = new Set(item.variants.map((v) => normaliseTerm(v)))
  const seen = new Set()
  for (const d of item.distractors) {
    const key = d.trim().toLowerCase()
    if (key === '') return { rule: 'empty-distractor', quote: JSON.stringify(item.distractors) }
    if (key === term) return { rule: 'distractor-duplicates-term', quote: d }
    if (variantKeys.has(normaliseTerm(d))) return { rule: 'distractor-duplicates-variant', quote: d }
    if (seen.has(key)) return { rule: 'duplicate-distractors', quote: d }
    seen.add(key)
  }
  return null
}

// Reused, not copied — CLAUDE.md's rule against duplicated machinery. "As shown in the slide" is
// exactly as broken in a clue or example sentence as it is in an MCQ prompt.
function checkSourceLeak(item) {
  const text = [item.clue, item.example_sentence ?? ''].join(' \n ')
  for (const pattern of SOURCE_LEAK_PATTERNS) {
    const m = text.match(pattern)
    if (m) return { rule: 'self-containment', quote: text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 10).trim() }
  }
  return null
}

// Mirrors questions-validate.mjs's checkProvenance. Unlike the MCQ validator, `page` is always a
// required field here (the generator schema demands it), so the check always runs.
function checkProvenance(item, ignorePages) {
  const value = item.page
  if (!Number.isInteger(value) || value <= 0) return { rule: 'provenance', quote: `page=${JSON.stringify(value)}` }
  if (ignorePages.has(value)) return { rule: 'provenance', quote: `page ${value} is in ignorePages` }
  return null
}

// checkOptionSetGiveaway runs LAST, deliberately. Everything ahead of it in this order is a
// structural defect distractor repair cannot fix (bad shape, a leaking clue, a chart-title term,
// a fill-in-the-blanks sentence missing its own term, a broken distractor set, a source leak, bad
// provenance) — those still fail the item outright. An item that clears every one of those and
// fails ONLY on checkOptionSetGiveaway is, by construction, otherwise sound: the sole defect is a
// distractor set that lets a giveaway token through, which is exactly what a distractor rewrite
// fixes. That is what makes `repairable` in validateTerms below well-defined.
const ORDERED_CHECKS = [
  checkShape, checkClueLeak, checkChartTitle, checkExampleContainsTerm,
  checkDistractors, checkSourceLeak, checkProvenance, checkOptionSetGiveaway,
]

/** Run the ordered pipeline against one item, ignore-set already resolved. Returns the first
 *  failure or null. Shared by validateTerms (whole batch) and revalidateItem (one repaired item). */
function runChecks(item, ignore) {
  for (const check of ORDERED_CHECKS) {
    const fail = check(item, ignore)
    if (fail) return fail
  }
  return null
}

/**
 * Validate a batch of generated term_definition primitives.
 *
 * No shuffle step — unlike MCQs there is no answer-position bias to fix here.
 *
 * @returns {{ passed: object[], rejected: {index:number, rule:string, quote:string}[],
 *   repairable: {index:number, rule:'option-set-giveaway', token:string, quote:string}[] }}
 *   `rejected` and `repairable` both carry the original index so callers can report on it.
 *   `repairable` items are NOT in `passed` — the caller (generate-terms.mjs) must repair their
 *   distractors and revalidate before either keeping or rejecting them; see `revalidateItem`.
 */
export function validateTerms(items, { ignorePages = [] } = {}) {
  if (!Array.isArray(items)) throw new TypeError('validateTerms expects an array')
  const ignore = ignorePages instanceof Set ? ignorePages : new Set(ignorePages)
  const passed = []
  const rejected = []
  const repairable = []
  const seenTerms = new Set()

  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') { rejected.push({ index, rule: 'shape', quote: 'not an object' }); return }
    const fail = runChecks(item, ignore)
    if (fail) {
      if (fail.rule === 'option-set-giveaway') repairable.push({ index, ...fail })
      else rejected.push({ index, ...fail })
      return
    }
    const key = item.term.trim().toLowerCase()
    if (seenTerms.has(key)) { rejected.push({ index, rule: 'duplicate-term', quote: item.term }); return }
    seenTerms.add(key)
    passed.push(item)
  })

  return { passed, rejected, repairable }
}

/** Re-run the full ordered pipeline on a single item (typically one whose distractors were just
 *  rewritten by generate-terms.mjs's repair step). Returns null (now clean) or the failing check —
 *  which may again be `option-set-giveaway` if the repair didn't land, or something else entirely
 *  if the new distractors introduced a fresh defect (e.g. a duplicate). Deliberately does not
 *  repeat validateTerms's cross-batch duplicate-term check: repair only ever touches distractors,
 *  never the term, so that check's outcome for this item cannot have changed. */
export function revalidateItem(item, ignorePages = []) {
  const ignore = ignorePages instanceof Set ? ignorePages : new Set(ignorePages)
  return runChecks(item, ignore)
}

// Exported for tests and for the read-only census against live rows (checks are pure functions
// of an item shaped like a `content_items` term_definition row plus its distractors).
export { checkOptionSetGiveaway, checkChartTitle }
