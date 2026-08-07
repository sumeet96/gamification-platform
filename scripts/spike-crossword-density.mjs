#!/usr/bin/env node
// SPIKE (7 Aug 2026) -- does a greedy criss-cross placer actually interlock our fragment vocabulary,
// or does it degenerate into disconnected islands?
//
// This is NOT a new question. docs/architecture/game4-rfc-prompt.md section 7.1 named it as the one
// open crossword problem that survived the fragment-entry fix: "with crossing density this low, is a
// crossword meaningfully different from fill-in-the-blanks arranged decoratively? The 'use crossings
// as evidence' mechanic requires checked letters, and sparse freeform grids barely have them." Section
// 6 benchmarked four real puzzles: a well-interlocked 22-entry example had 6 entries <=8 cells and
// (implicitly) real crossing density; a 50-entry freeform generator on a similar corpus came out under
// 25% fill. This script runs the exact greedy-placement-with-random-restarts algorithm a consumer
// crossword generator uses (sort by length, place longest first, search every letter of every
// candidate word for a matching grid letter, test the perpendicular placement, score by
// intersections*10 - area, keep the best of N restarts) against our REAL fragment vocabulary and
// reports the same two numbers the RFC used to reject crossword: fill density and words-placed vs
// words-orphaned. The algorithm is well known; running it on real data is the part that was missing.
//
// Fragments, not canonical terms: docs/architecture/game4-rfc-prompt.md section 4.2 -- "entry length
// is NOT the crossword blocker" -- established that a grid entry is any content word from a term, not
// the canonical term itself. This script reproduces that extraction (stopword-filtered content words,
// length 3-10) rather than re-deciding it.
//
// Reads term_definition rows directly off Neon (read-only, no writes). Falls back to the local
// spike-data snapshots if DATABASE_URL is unset, so this also runs offline.
//
// Usage:
//   node scripts/spike-crossword-density.mjs [--restarts 100] [--min-len 3] [--max-len 10]
//     [--subject "Digital Transformation"] [--out spike-data/crossword-density.json]

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
import { loadEnv } from './lib/llm-client.mjs'

loadEnv()

const flag = (name, fallback = null) => {
  const i = process.argv.indexOf(name)
  if (i === -1) return fallback
  const v = process.argv[i + 1]
  if (!v || v.startsWith('--')) return fallback
  return v
}

const restarts = Number(flag('--restarts', 100))
const minLen = Number(flag('--min-len', 3))
const maxLen = Number(flag('--max-len', 10))
const subjectFilter = flag('--subject')
const sourceFilter = flag('--source-id')
const outPath = flag('--out')

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'to', 'for', 'and', 'or', 'is', 'are',
  'with', 'by', 'as', 'at', 'from', 'into', 'that', 'this', 'its', 'be',
])

// --- Load real terms: live Neon if reachable, else the local spike snapshots. ---

async function loadTerms() {
  const DB = process.env.DATABASE_URL
  if (DB) {
    try {
      const sql = neon(DB)
      const rows = sourceFilter
        ? await sql`
            select term, subject, source_id from content_items
            where kind = 'term_definition' and retired_at is null and source_id = ${sourceFilter}
          `
        : await sql`
            select term, subject, source_id from content_items
            where kind = 'term_definition' and retired_at is null
          `
      console.log(`Loaded ${rows.length} live term_definition rows from Neon${sourceFilter ? ` (source_id=${sourceFilter})` : ''}.`)
      return rows.map((r) => ({ term: r.term, subject: r.subject }))
    } catch (err) {
      console.error(`Neon read failed (${err.message}); falling back to local spike-data.`)
    }
  } else {
    console.log('No DATABASE_URL; using local spike-data snapshots.')
  }
  const files = [
    'spike-data/terms-twdeck-live.json',
    'spike-data/terms-cage-live.json',
    'spike-data/terms-case-live.json',
  ].filter(existsSync)
  if (!files.length) throw new Error('No local term snapshots found either. Nothing to run against.')
  const out = []
  for (const f of files) {
    const rows = JSON.parse(readFileSync(f, 'utf8'))
    for (const r of rows) out.push({ term: r.term, subject: r.topic || f })
  }
  console.log(`Loaded ${out.length} terms from ${files.length} local snapshot(s): ${files.join(', ')}`)
  return out
}

// --- Fragment + constituent-expansion extraction, per game4-rfc-prompt.md section 4.2. ---

function fragmentsOf(term) {
  const words = term
    .split(/[\s\-\/]+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ''))
    .filter(Boolean)
  return words
    .filter((w) => !STOPWORDS.has(w.toLowerCase()))
    .map((w) => w.toUpperCase())
    .filter((w) => w.length >= minLen && w.length <= maxLen)
}

// --- The greedy criss-cross placer, both orientations, adjacency-checked. ---

function key(x, y) { return `${x},${y}` }

function canPlace(grid, word, x, y, dir) {
  for (let i = 0; i < word.length; i++) {
    const cx = dir === 'H' ? x + i : x
    const cy = dir === 'H' ? y : y + i
    const existing = grid.get(key(cx, cy))
    if (existing !== undefined && existing !== word[i]) return false
    // Reject if this placement would make the word touch a perpendicular neighbour
    // (fake-word / bad-adjacency guard) except at a genuine intersection cell.
    if (existing === undefined) {
      const neighbours = dir === 'H'
        ? [key(cx, cy - 1), key(cx, cy + 1)]
        : [key(cx - 1, cy), key(cx + 1, cy)]
      for (const n of neighbours) if (grid.has(n)) return false
    }
  }
  // Cells immediately before/after the word must be empty (no run-on into another word).
  const before = dir === 'H' ? key(x - 1, y) : key(x, y - 1)
  const after = dir === 'H' ? key(x + word.length, y) : key(x, y + word.length)
  if (grid.has(before) || grid.has(after)) return false
  return true
}

function place(grid, word, x, y, dir, placed) {
  for (let i = 0; i < word.length; i++) {
    const cx = dir === 'H' ? x + i : x
    const cy = dir === 'H' ? y : y + i
    grid.set(key(cx, cy), word[i])
  }
  placed.push({ word, x, y, dir })
}

function bbox(grid) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const k of grid.keys()) {
    const [x, y] = k.split(',').map(Number)
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1 }
}

function tryPlaceWord(grid, word) {
  let best = null
  let bestScore = -Infinity
  for (let i = 0; i < word.length; i++) {
    for (const [k, letter] of grid.entries()) {
      if (letter !== word[i]) continue
      const [gx, gy] = k.split(',').map(Number)
      // Try both orientations, anchored so word[i] lands on (gx, gy).
      for (const dir of ['H', 'V']) {
        const x = dir === 'H' ? gx - i : gx
        const y = dir === 'H' ? gy : gy - i
        if (!canPlace(grid, word, x, y, dir)) continue
        const trial = new Map(grid)
        for (let j = 0; j < word.length; j++) {
          const cx = dir === 'H' ? x + j : x
          const cy = dir === 'H' ? y : y + j
          trial.set(key(cx, cy), word[j])
        }
        const { w, h } = bbox(trial)
        let intersections = 0
        for (let j = 0; j < word.length; j++) {
          const cx = dir === 'H' ? x + j : x
          const cy = dir === 'H' ? y : y + j
          if (grid.has(key(cx, cy))) intersections++
        }
        const score = intersections * 10 - w * h
        if (score > bestScore) { bestScore = score; best = { x, y, dir } }
      }
    }
  }
  return best
}

function runOnce(words) {
  const grid = new Map()
  const placed = []
  const orphaned = []
  const first = words[0]
  for (let i = 0; i < first.length; i++) grid.set(key(0, i), first[i])
  placed.push({ word: first, x: 0, y: 0, dir: 'V' })
  for (const word of words.slice(1)) {
    const spot = tryPlaceWord(grid, word)
    if (spot) place(grid, word, spot.x, spot.y, spot.dir, placed)
    else orphaned.push(word)
  }
  const { w, h } = bbox(grid)
  const intersectionCells = [...grid.keys()].length
  const totalCells = w * h
  return { placed, orphaned, w, h, fillCells: intersectionCells, totalCells }
}

function shuffle(arr, rng) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function seededRng(seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

async function main() {
  const rows = await loadTerms()
  const filtered = subjectFilter ? rows.filter((r) => r.subject === subjectFilter) : rows

  const fragSet = new Map() // fragment -> Set(source terms), for the collision report
  for (const r of filtered) {
    for (const frag of fragmentsOf(r.term)) {
      if (!fragSet.has(frag)) fragSet.set(frag, new Set())
      fragSet.get(frag).add(r.term)
    }
  }
  const words = [...fragSet.keys()]
  if (words.length < 2) throw new Error(`Only ${words.length} fragment(s) in range [${minLen},${maxLen}] -- nothing to place.`)

  console.log(`\n${filtered.length} terms -> ${words.length} unique fragments in [${minLen},${maxLen}] cells.`)
  const collisions = [...fragSet.entries()].filter(([, terms]) => terms.size > 1)
  console.log(`${collisions.length} fragment(s) claimed by more than one term (board-selection concern, not a placement concern).`)

  let best = null
  const rng = seededRng(42)
  for (let attempt = 0; attempt < restarts; attempt++) {
    const byLen = new Map()
    for (const w of words) {
      if (!byLen.has(w.length)) byLen.set(w.length, [])
      byLen.get(w.length).push(w)
    }
    const lens = [...byLen.keys()].sort((a, b) => b - a)
    const order = lens.flatMap((l) => shuffle(byLen.get(l), rng))
    const result = runOnce(order)
    const score = result.placed.length * 10 - result.totalCells
    if (!best || score > best.score) best = { ...result, score, attempt }
  }

  const fillPct = ((best.fillCells / best.totalCells) * 100).toFixed(1)
  console.log(`\n=== BEST OF ${restarts} RESTARTS ===`)
  console.log(`Grid: ${best.w}x${best.h} (${best.totalCells} cells), ${best.fillCells} filled -> ${fillPct}% density.`)
  console.log(`Placed: ${best.placed.length}/${words.length}  Orphaned (no intersection found): ${best.orphaned.length}`)
  if (best.orphaned.length) console.log(`Orphaned words: ${best.orphaned.join(', ')}`)
  console.log(`\nBenchmark from docs/architecture/game4-rfc-prompt.md section 6: a well-interlocked`)
  console.log(`published puzzle had 6/22 entries <=8 cells and dense crossing; a 50-entry freeform`)
  console.log(`generator on a similar corpus came out under 25% fill.`)
  console.log(fillPct >= 25
    ? `RESULT: >=25% fill -- comparable to or better than the freeform-generator floor. Worth a closer look.`
    : `RESULT: <25% fill -- reproduces the exact sparse-grid failure mode the RFC flagged. The algorithm is not the missing piece.`)

  if (outPath) {
    writeFileSync(outPath, JSON.stringify({
      termCount: filtered.length,
      fragmentCount: words.length,
      collisions: collisions.map(([frag, terms]) => ({ fragment: frag, terms: [...terms] })),
      restarts,
      best: { w: best.w, h: best.h, totalCells: best.totalCells, fillCells: best.fillCells, fillPct: Number(fillPct), placed: best.placed, orphaned: best.orphaned },
    }, null, 2))
    console.log(`\nWrote ${outPath}`)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
