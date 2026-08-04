// Same construction as scripts/lib/quintile-difficulty.mjs, cut to 3 bands instead of 5, for the
// band-count spike in scripts/analyse-band-count.mjs (docs/CURRENT_STATE.md, "3 vs 5 bands"). NOT
// wired into the pipeline — this exists to measure whether 3 bands would be more defensible than 5,
// not to replace quintileDifficulty. Do not import this into calibrate-difficulty.mjs or any route.
//
// Mirrors quintileDifficulty's semantics exactly: `ps` is simulated_p (fraction correct, high = easy),
// band 1 = easiest (highest p), band 3 = hardest (lowest p) -- the same inversion, for the same reason
// (a mixed-up direction would ramp the adaptive lever the wrong way if this were ever promoted).
//
// TIES MUST BIN TOGETHER, exactly as in quintileDifficulty: a tied group takes ONE band, chosen by
// the group's midrank, never split across a band boundary by rank position. When a large group ties,
// whole bands can come out empty -- that is the honest signal, not a bug to smooth over.

/**
 * @param {number[]} ps - simulated_p values (0..1), one per item, in any order
 * @returns {number[]} band (1-3), aligned index-for-index with `ps`
 */
export function tertileDifficulty(ps) {
  const n = ps.length
  if (n === 0) return []
  // Rank ascending by p: rank 0 = lowest p = hardest item in the run.
  const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p || a.i - b.i)
  const band = Array(n)

  let start = 0
  while (start < n) {
    let end = start
    while (end + 1 < n && order[end + 1].p === order[start].p) end++
    const midRank = (start + end) / 2
    const bin = Math.min(2, Math.floor((midRank * 3) / n)) // 0 = lowest p .. 2 = highest p
    for (let k = start; k <= end; k++) band[order[k].i] = 3 - bin
    start = end + 1
  }
  return band
}
