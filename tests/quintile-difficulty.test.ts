// scripts/calibrate-difficulty.mjs bins simulated_p (fraction correct, high = easy) into a 1-5
// difficulty column (1 = easiest, 5 = hardest) by quintile over one run's own distribution. The
// mapping is INVERTED — see scripts/lib/quintile-difficulty.mjs — and this is the easiest bug to
// ship here, so it gets a dedicated test rather than relying on eyeballing a --dry-run.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quintileDifficulty } from '../scripts/lib/quintile-difficulty.mjs'

test('inversion: highest simulated_p (easiest item) gets difficulty 1, lowest gets difficulty 5', () => {
  const ps = [0.1, 0.9, 0.5, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.95]
  const diff = quintileDifficulty(ps)
  const easiestIdx = ps.indexOf(Math.max(...ps))
  const hardestIdx = ps.indexOf(Math.min(...ps))
  assert.equal(diff[easiestIdx], 1, 'highest simulated_p must map to difficulty 1 (easiest)')
  assert.equal(diff[hardestIdx], 5, 'lowest simulated_p must map to difficulty 5 (hardest)')
  for (const d of diff) assert.ok(d >= 1 && d <= 5, `difficulty out of range: ${d}`)
})

test('monotonic: difficulty never increases as simulated_p increases', () => {
  const ps = [0.05, 0.15, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 0.99]
  const diff = quintileDifficulty(ps)
  for (let i = 1; i < ps.length; i++) {
    assert.ok(diff[i] <= diff[i - 1], `p increased from ${ps[i - 1]} to ${ps[i]} but difficulty went from ${diff[i - 1]} to ${diff[i]}`)
  }
})

test('bin sizes stay roughly even on 17 items, the current content_items count', () => {
  const ps = Array.from({ length: 17 }, (_, i) => i / 16)
  const diff = quintileDifficulty(ps)
  const counts = [0, 0, 0, 0, 0]
  for (const d of diff) counts[d - 1]++
  for (const c of counts) assert.ok(c === 3 || c === 4, `expected 3 or 4 items per bin on 17 items, got [${counts}]`)
  assert.equal(counts.reduce((a, b) => a + b, 0), 17)
})

test('ties tie-break deterministically by original index, not thrown away', () => {
  const ps = [0.5, 0.5, 0.5, 0.5, 0.5]
  const diff = quintileDifficulty(ps)
  assert.deepEqual(diff, quintileDifficulty(ps), 'same input must always produce the same output')
  assert.equal(diff.length, 5)
})

// Regression: the first calibration dry run assigned difficulty 4 and 5 to two items that both
// scored p=0.77, and split six items all at p=1.00 across difficulty 1 and 2. Identical evidence
// must produce identical difficulty -- otherwise the adaptive lever serves questions based on a
// distinction the measurement never made.
test('items with identical simulated_p always get identical difficulty', () => {
  const ps = [0.13, 0.37, 0.47, 0.77, 0.77, 0.8, 0.8, 0.9, 0.93, 0.97, 0.97, 1, 1, 1, 1, 1, 1]
  const d = quintileDifficulty(ps)
  const byScore = new Map<number, Set<number>>()
  ps.forEach((p, i) => {
    if (!byScore.has(p)) byScore.set(p, new Set())
    byScore.get(p)!.add(d[i])
  })
  for (const [p, levels] of byScore) {
    assert.equal(levels.size, 1, `p=${p} produced difficulties ${[...levels].join(',')}`)
  }
})

test('ties never break monotonicity: a higher score is never rated harder', () => {
  const ps = [0.13, 0.37, 0.47, 0.77, 0.77, 0.8, 0.8, 0.9, 0.93, 0.97, 0.97, 1, 1, 1, 1, 1, 1]
  const d = quintileDifficulty(ps)
  for (let i = 0; i < ps.length; i++) {
    for (let j = 0; j < ps.length; j++) {
      if (ps[i] > ps[j]) assert.ok(d[i] <= d[j], `p=${ps[i]}→d${d[i]} vs p=${ps[j]}→d${d[j]}`)
    }
  }
})
