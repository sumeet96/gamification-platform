// scripts/lib/tertile-difficulty.mjs is the 3-band twin of quintile-difficulty.mjs, built for the
// band-count spike (scripts/analyse-band-count.mjs, CLAUDE.md "3 vs 5 bands" discussion). It must
// preserve the same standing rules as the 5-band version: ties share a band, never binned by rank
// position, and high simulated_p (easy) maps to band 1, low p (hard) maps to band 3.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tertileDifficulty } from '../scripts/lib/tertile-difficulty.mjs'

test('inversion: highest simulated_p (easiest item) gets band 1, lowest gets band 3', () => {
  const ps = [0.1, 0.9, 0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.95]
  const band = tertileDifficulty(ps)
  const easiestIdx = ps.indexOf(Math.max(...ps))
  const hardestIdx = ps.indexOf(Math.min(...ps))
  assert.equal(band[easiestIdx], 1, 'highest simulated_p must map to band 1 (easiest)')
  assert.equal(band[hardestIdx], 3, 'lowest simulated_p must map to band 3 (hardest)')
  for (const b of band) assert.ok(b >= 1 && b <= 3, `band out of range: ${b}`)
})

test('monotonic: band never increases as simulated_p increases', () => {
  const ps = [0.05, 0.15, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 0.99]
  const band = tertileDifficulty(ps)
  for (let i = 1; i < ps.length; i++) {
    assert.ok(band[i] <= band[i - 1], `p increased from ${ps[i - 1]} to ${ps[i]} but band went from ${band[i - 1]} to ${band[i]}`)
  }
})

test('ties share a band -- not thrown across a boundary by rank position', () => {
  // Regression pattern mirrored from quintileDifficulty's own test: a first run of the 5-band
  // version split two items tied at p=0.77 across bands 4 and 5, and six items all at p=1.00 split
  // across bands 1 and 2. The 3-band binner must not repeat that mistake.
  const ps = [0.13, 0.37, 0.47, 0.77, 0.77, 0.8, 0.8, 0.9, 0.93, 0.97, 0.97, 1, 1, 1, 1, 1, 1]
  const band = tertileDifficulty(ps)
  const byScore = new Map<number, Set<number>>()
  ps.forEach((p, i) => {
    if (!byScore.has(p)) byScore.set(p, new Set())
    byScore.get(p)!.add(band[i])
  })
  for (const [p, bands] of byScore) {
    assert.equal(bands.size, 1, `p=${p} produced bands ${[...bands].join(',')}`)
  }
})

test('a large tied group can leave a band empty -- that is the honest signal, not smoothed away', () => {
  // 34 of 50 items tied at the same p is the actual shape seen in termbake-qwen2-5-1-5b.json; the
  // whole group must land in one band even if that empties another band entirely.
  const ps = [...Array(34).fill(0.5), ...Array(16).fill(0.9)]
  const band = tertileDifficulty(ps)
  const counts = [0, 0, 0]
  for (const b of band) counts[b - 1]++
  assert.equal(counts.reduce((a, b) => a + b, 0), 50)
  // The 34-way tie is one indivisible block; it cannot be split to fill an otherwise-empty band.
  const tiedBand = band[0]
  for (let i = 0; i < 34; i++) assert.equal(band[i], tiedBand, 'the tied block must land in a single band')
})

test('ties never break monotonicity: a higher score is never rated harder', () => {
  const ps = [0.13, 0.37, 0.47, 0.77, 0.77, 0.8, 0.8, 0.9, 0.93, 0.97, 0.97, 1, 1, 1, 1, 1, 1]
  const band = tertileDifficulty(ps)
  for (let i = 0; i < ps.length; i++) {
    for (let j = 0; j < ps.length; j++) {
      if (ps[i] > ps[j]) assert.ok(band[i] <= band[j], `p=${ps[i]}->b${band[i]} vs p=${ps[j]}->b${band[j]}`)
    }
  }
})

test('deterministic: same input always produces the same output', () => {
  const ps = [0.5, 0.5, 0.5, 0.5, 0.5]
  const band = tertileDifficulty(ps)
  assert.deepEqual(band, tertileDifficulty(ps))
  assert.equal(band.length, 5)
})

test('empty input returns empty output', () => {
  assert.deepEqual(tertileDifficulty([]), [])
})
