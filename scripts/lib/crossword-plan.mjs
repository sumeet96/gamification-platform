// Pure crossword placement + planning helpers for scripts/author-crossword-boards.mjs (package A6).
//
// EVERY placement function below (fragmentsOf, canPlace, place, bbox, tryPlaceWord, runOnce, shuffle,
// seededRng) is a byte-for-byte port of scripts/spike-crossword-density.mjs's already-built, already-
// tested-this-session algorithm. The ONLY differences are mechanical: minLen/maxLen/stopwords and the
// RNG are passed as explicit parameters here instead of being read from that script's own module-scope
// CLI flags (`flag('--min-len', 3)` etc). That parameterization is required, not optional -- the spike
// script computes those flags from `process.argv` at module-import time and calls its own `main()` as
// an import side effect, so it cannot be `import`-ed by another script without also re-running its CLI
// parsing and measurement run. Extracting the pure algorithm into this importable module, instead of
// copy-pasting it inline into author-crossword-boards.mjs, mirrors the project's existing pure-helper-
// extraction convention (scripts/lib/connections-plan.mjs, scripts/lib/term-import-plan.mjs,
// scripts/lib/terms-validate.mjs): split out so the parts with no I/O are unit-testable without a live
// Neon connection. scripts/spike-crossword-density.mjs itself is NOT modified by this file's existence
// -- it still runs standalone, unchanged, exactly as it did when it produced this session's measured
// 43.5% density / 28-of-30-placed result.
//
// game4-rfc-prompt.md section 4.2's fragment-entry method: a grid entry is any content word from a
// term (stopword-filtered, length-bounded), not the canonical term itself.

import { createHash } from 'node:crypto'

export const DEFAULT_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'to', 'for', 'and', 'or', 'is', 'are',
  'with', 'by', 'as', 'at', 'from', 'into', 'that', 'this', 'its', 'be',
])

/** Same extraction as spike-crossword-density.mjs's fragmentsOf: split on whitespace/hyphen/slash,
 *  strip non-letters, drop stopwords, uppercase, keep length in [minLen, maxLen]. */
export function fragmentsOf(term, minLen = 3, maxLen = 10, stopwords = DEFAULT_STOPWORDS) {
  const words = term
    .split(/[\s\-\/]+/)
    .map((w) => w.replace(/[^A-Za-z]/g, ''))
    .filter(Boolean)
  return words
    .filter((w) => !stopwords.has(w.toLowerCase()))
    .map((w) => w.toUpperCase())
    .filter((w) => w.length >= minLen && w.length <= maxLen)
}

function key(x, y) { return `${x},${y}` }

// --- The greedy criss-cross placer, both orientations, adjacency-checked. Ported verbatim from
// scripts/spike-crossword-density.mjs -- do not "improve" this without re-running that script's own
// density spike, since the two are meant to stay behaviourally identical. ---

export function canPlace(grid, word, x, y, dir) {
  for (let i = 0; i < word.length; i++) {
    const cx = dir === 'H' ? x + i : x
    const cy = dir === 'H' ? y : y + i
    const existing = grid.get(key(cx, cy))
    if (existing !== undefined && existing !== word[i]) return false
    if (existing === undefined) {
      const neighbours = dir === 'H'
        ? [key(cx, cy - 1), key(cx, cy + 1)]
        : [key(cx - 1, cy), key(cx + 1, cy)]
      for (const n of neighbours) if (grid.has(n)) return false
    }
  }
  const before = dir === 'H' ? key(x - 1, y) : key(x, y - 1)
  const after = dir === 'H' ? key(x + word.length, y) : key(x, y + word.length)
  if (grid.has(before) || grid.has(after)) return false
  return true
}

export function place(grid, word, x, y, dir, placed) {
  for (let i = 0; i < word.length; i++) {
    const cx = dir === 'H' ? x + i : x
    const cy = dir === 'H' ? y : y + i
    grid.set(key(cx, cy), word[i])
  }
  placed.push({ word, x, y, dir })
}

export function bbox(grid) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const k of grid.keys()) {
    const [x, y] = k.split(',').map(Number)
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  return { w: maxX - minX + 1, h: maxY - minY + 1 }
}

export function tryPlaceWord(grid, word) {
  let best = null
  let bestScore = -Infinity
  for (let i = 0; i < word.length; i++) {
    for (const [k, letter] of grid.entries()) {
      if (letter !== word[i]) continue
      const [gx, gy] = k.split(',').map(Number)
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

export function runOnce(words) {
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
  const fillCells = [...grid.keys()].length
  const totalCells = w * h
  return { placed, orphaned, w, h, fillCells, totalCells }
}

export function shuffle(arr, rng) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function seededRng(seed) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

/** Best-of-N-restarts wrapper around runOnce -- the exact loop scripts/spike-crossword-density.mjs's
 *  main() runs, extracted so the authoring script doesn't duplicate it. Deterministic for a fixed
 *  seed (default 42, matching the spike), so re-running against an unchanged content_items table
 *  reproduces the identical placement -- required for the --out / --review-file round trip to make
 *  sense (a human resolves collisions against fragment/x/y/direction keys that must not shift under
 *  them between invocations). */
export function placeBest(words, restarts = 100, seed = 42) {
  let best = null
  const rng = seededRng(seed)
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
  return best
}

// Coordinate translation (0-indexing the placer's possibly-negative raw output) is done once, in
// scripts/author-crossword-boards.mjs itself, uniformly across BOTH resolved entries and pending
// collisions at the point they're built from `best.placed` -- not as a separate post-hoc step here.
// That is deliberate: translating entries and collisions on two different schedules (e.g. entries
// only, computed from whatever subset survived collision/duplicate exclusion) would put them in two
// different coordinate frames within the SAME --out JSON, and would break the (fragment,x,y,direction)
// key a --review-file round trip depends on to match a prior run's collisions back to a later one's.

// --- Board id, mirroring connections-plan.mjs's computeBoardId/computeGroupId pattern (sha256 of a
// stable NATURAL KEY, never array position) -- see that file's header for why array position is
// disallowed as a key ingredient. ---

/** A crossword board's natural key is its source_id plus the SORTED set of content_item_ids that
 *  ended up as resolved entries on it -- not source_id alone, because (unlike Connections' human-
 *  curated board slugs) a crossword board's entry set is itself computed and can legitimately change
 *  invocation to invocation as fragment collisions get resolved or the content bank grows. This means
 *  the id an initial --dry-run prints (before any collision is resolved, so fewer entries are
 *  resolved) WILL differ from the id of a later --commit run against the same --source-id once
 *  --review-file resolves those collisions -- that is expected, not a bug: the id names the entries
 *  set actually being authored in THIS invocation, not a hypothetical earlier one. */
export function computeBoardId(sourceId, sortedContentItemIds) {
  return createHash('sha256')
    .update(`${sourceId}::crossword-board::${sortedContentItemIds.join(',')}`)
    .digest('hex')
    .slice(0, 32)
}
