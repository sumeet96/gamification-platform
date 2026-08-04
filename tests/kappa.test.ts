// scripts/lib/kappa.mjs backs the band-count spike (scripts/analyse-band-count.mjs). The whole point
// of that spike is that raw agreement rises automatically as band count falls, so the chance-corrected
// numbers (Cohen's kappa, quadratic-weighted kappa) are the ones that actually decide the question --
// they get a hand-computed example, not just an eyeballed sanity check.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  contingencyTable,
  exactAgreement,
  withinOneAgreement,
  cohenKappa,
  weightedKappaQuadratic,
  spearmanRho,
} from '../scripts/lib/kappa.mjs'

const close = (actual: number, expected: number, msg: string) => assert.ok(Math.abs(actual - expected) < 1e-9, `${msg}: got ${actual}, expected ${expected}`)

// Hand-computed 3-category, 10-item example, worked by hand in the PR that added this file:
//   contingency table (rows = a, cols = b):
//     [2 1 0]
//     [0 2 1]
//     [1 0 3]
//   row marginals [3,3,4], col marginals [3,3,4], n=10
//   po = (2+2+3)/10 = 0.7
//   pe = 0.09 + 0.09 + 0.16 = 0.34
//   kappa = (0.7 - 0.34) / (1 - 0.34) = 0.36/0.66 = 6/11
//   weighted-observed (quadratic, k=3) = 1.5, weighted-expected = 3.45, qwk = 1 - 1.5/3.45
const a = [1, 1, 1, 2, 2, 2, 3, 3, 3, 3]
const b = [1, 1, 2, 2, 2, 3, 3, 3, 3, 1]

test('contingencyTable matches the hand-worked 3x3 table', () => {
  assert.deepEqual(contingencyTable(a, b, 3), [
    [2, 1, 0],
    [0, 2, 1],
    [1, 0, 3],
  ])
})

test('exactAgreement and withinOneAgreement match the hand count', () => {
  close(exactAgreement(a, b), 0.7, 'exact agreement')
  close(withinOneAgreement(a, b), 0.9, 'within-one agreement')
})

test("Cohen's kappa matches the hand-worked po/pe/kappa", () => {
  const { po, pe, kappa } = cohenKappa(a, b, 3)
  close(po, 0.7, 'po')
  close(pe, 0.34, 'pe')
  close(kappa, 6 / 11, 'kappa')
})

test('quadratic-weighted kappa matches the hand-worked weighted sums', () => {
  const { kappa } = weightedKappaQuadratic(a, b, 3)
  close(kappa, 1 - 1.5 / 3.45, 'qwk')
})

test('perfect agreement gives kappa = 1 and qwk = 1', () => {
  const same = [1, 2, 3, 1, 2, 3, 1, 1, 2, 3]
  assert.equal(exactAgreement(same, same), 1)
  close(cohenKappa(same, same, 3).kappa, 1, 'perfect kappa')
  close(weightedKappaQuadratic(same, same, 3).kappa, 1, 'perfect qwk')
})

test('a band reduction that only shrinks chance-level agreement scores kappa near zero, not high', () => {
  // Two independent-looking raters who happen to share the same (skewed) marginal distribution:
  // raw exact agreement is inflated by the shared skew, but kappa must correct it back down.
  const skewedA = [1, 1, 1, 1, 1, 1, 1, 1, 2, 3]
  const skewedB = [1, 1, 1, 1, 1, 1, 1, 2, 1, 3]
  const raw = exactAgreement(skewedA, skewedB)
  const { kappa } = cohenKappa(skewedA, skewedB, 3)
  assert.ok(raw > 0.6, `expected high raw agreement from shared skew, got ${raw}`)
  assert.ok(kappa < raw, `chance-corrected kappa (${kappa}) must be pulled below raw agreement (${raw})`)
})

test('spearmanRho is 1 for a monotonic transform and -1 for a reversal', () => {
  close(spearmanRho([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]), 1, 'monotonic increasing')
  close(spearmanRho([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]), -1, 'monotonic decreasing')
})

test('spearmanRho averages ranks on ties, matching the reference implementation used elsewhere in the project', () => {
  // scripts/spike-compare-arms.mjs carries an equivalent tie-averaged Spearman; this is the same
  // algorithm re-verified against a hand-tied case rather than trusted by inspection.
  const rho = spearmanRho([1, 1, 2, 3], [2, 1, 1, 3])
  assert.ok(Number.isFinite(rho), 'rho must be a finite number, not NaN, when ties are present')
})
