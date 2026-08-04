// Chance-corrected agreement, implemented locally because reducing the number of difficulty bands
// makes RAW agreement rise automatically -- chance agreement is ~1/3 at 3 bands vs ~1/5 at 5 -- so raw
// agreement cannot be used on its own to argue 3 bands is "more defensible" than 5
// (scripts/analyse-band-count.mjs). No new dependencies; this is the whole implementation.

/**
 * Build a k x k contingency table: table[i][j] = count of items rated band i by `a` and band j by
 * `b`. Bands are assumed to be integers in [1, k]; pass k explicitly rather than inferring it, so an
 * empty band still gets its row/column.
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} k
 */
export function contingencyTable(a, b, k) {
  if (a.length !== b.length) throw new Error(`contingencyTable: length mismatch (${a.length} vs ${b.length})`)
  const table = Array.from({ length: k }, () => Array(k).fill(0))
  for (let i = 0; i < a.length; i++) table[a[i] - 1][b[i] - 1]++
  return table
}

/** Raw exact-match agreement, as a fraction 0..1. */
export function exactAgreement(a, b) {
  const n = a.length
  let hits = 0
  for (let i = 0; i < n; i++) if (a[i] === b[i]) hits++
  return hits / n
}

/** Fraction of items whose two band assignments differ by at most one band. */
export function withinOneAgreement(a, b) {
  const n = a.length
  let hits = 0
  for (let i = 0; i < n; i++) if (Math.abs(a[i] - b[i]) <= 1) hits++
  return hits / n
}

/**
 * Cohen's kappa: (observed agreement - chance agreement) / (1 - chance agreement), where chance
 * agreement is computed from the OBSERVED marginals of this pair, per Cohen (1960) -- not assumed
 * uniform. A kappa of 0 means the raters do no better than their own marginal distributions predict;
 * 1 means perfect agreement.
 * @returns {{ kappa: number, po: number, pe: number }}
 */
export function cohenKappa(a, b, k) {
  const n = a.length
  const table = contingencyTable(a, b, k)
  let po = 0
  for (let i = 0; i < k; i++) po += table[i][i]
  po /= n

  const rowMarginal = table.map((row) => row.reduce((s, v) => s + v, 0))
  const colMarginal = Array.from({ length: k }, (_, j) => table.reduce((s, row) => s + row[j], 0))
  let pe = 0
  for (let i = 0; i < k; i++) pe += (rowMarginal[i] / n) * (colMarginal[i] / n)

  const kappa = pe === 1 ? NaN : (po - pe) / (1 - pe)
  return { kappa, po, pe }
}

/**
 * Quadratic-weighted kappa (Cohen, 1968): penalises disagreement by squared band distance, so being
 * off by two bands counts more than off by one -- appropriate here because the bands are ordinal
 * (1-5 or 1-3 difficulty), not an unordered category set.
 * weight(i,j) = (i-j)^2 / (k-1)^2 ; kappa = 1 - (sum w*O) / (sum w*E), E from independence on the
 * observed marginals (same E as cohenKappa above, just not divided by n twice).
 * @returns {{ kappa: number }}
 */
export function weightedKappaQuadratic(a, b, k) {
  const n = a.length
  const table = contingencyTable(a, b, k)
  const rowMarginal = table.map((row) => row.reduce((s, v) => s + v, 0))
  const colMarginal = Array.from({ length: k }, (_, j) => table.reduce((s, row) => s + row[j], 0))

  const denom = (k - 1) * (k - 1)
  let weightedObserved = 0
  let weightedExpected = 0
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const w = denom === 0 ? 0 : ((i - j) * (i - j)) / denom
      weightedObserved += w * table[i][j]
      weightedExpected += w * (rowMarginal[i] * colMarginal[j]) / n
    }
  }
  const kappa = weightedExpected === 0 ? NaN : 1 - weightedObserved / weightedExpected
  return { kappa }
}

/**
 * Spearman rank correlation, average ranks for ties. Used here on the CONTINUOUS simulated_p values
 * (never on the binned bands) as the band-count-independent ceiling: no binning scheme can recover
 * more ranking agreement than the underlying facilities already have.
 */
export function spearmanRho(a, b) {
  const n = a.length
  if (n !== b.length) throw new Error(`spearmanRho: length mismatch (${n} vs ${b.length})`)
  const rank = (xs) => {
    const idx = xs.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v)
    const r = Array(xs.length)
    for (let i = 0; i < idx.length; ) {
      let j = i
      while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++
      const avg = (i + j) / 2 + 1
      for (let m = i; m <= j; m++) r[idx[m].i] = avg
      i = j + 1
    }
    return r
  }
  const ra = rank(a), rb = rank(b)
  const mean = (xs) => xs.reduce((s, v) => s + v, 0) / xs.length
  const ma = mean(ra), mb = mean(rb)
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb)
    da += (ra[i] - ma) ** 2
    db += (rb[i] - mb) ** 2
  }
  return da === 0 || db === 0 ? NaN : num / Math.sqrt(da * db)
}
