// Turns one run's `simulated_p` values into 1-5 `difficulty` ranks, by quintile position within
// THIS run's own distribution — never fixed thresholds. Fixed thresholds collapse into one or two
// bands whenever the simulator turns out uniformly strong or weak on the material; quintiles always
// spread a run's own items across all five bins (db/006_add_content_item_difficulty.sql).
//
// THE INVERSION: `simulated_p` is the fraction of simulated students who answered CORRECTLY, so a
// high p means the item is EASY. `difficulty` is 1 = easiest, 5 = hardest. So the top quintile of
// `simulated_p` (highest success rate) becomes `difficulty = 1`, and the bottom quintile (lowest
// success rate) becomes `difficulty = 5`. Getting this backwards would make the adaptive lever ramp
// students onto harder material as they succeed and easier material as they struggle — the exact
// opposite of what it is meant to do.

/**
 * @param {number[]} ps - simulated_p values (0..1), one per item, in any order
 * @returns {number[]} difficulty (1-5), aligned index-for-index with `ps`
 */
export function quintileDifficulty(ps) {
  const n = ps.length
  if (n === 0) return []
  // Rank ascending by p: rank 0 = lowest p = hardest item in the run.
  const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p || a.i - b.i)
  const difficulty = Array(n)

  // TIES MUST BIN TOGETHER. Binning on raw rank position splits equal scores across a band
  // boundary: a first run produced two items both at p=0.77 that landed on difficulty 4 and 5, and
  // six items all at p=1.00 split three-and-three across difficulty 1 and 2. Those items are
  // indistinguishable by measurement, so any ordering between them is invented, and the invention
  // would then drive which questions a student is served.
  //
  // Every group of identical p therefore takes ONE bin, chosen by the group's midrank -- the same
  // tied-rank convention Spearman uses. A consequence worth understanding rather than tuning away:
  // when a large group ties, whole bands can come out empty. That is the honest signal that the
  // bank cannot support five levels, not a bug to smooth over.
  let start = 0
  while (start < n) {
    let end = start
    while (end + 1 < n && order[end + 1].p === order[start].p) end++
    const midRank = (start + end) / 2
    const bin = Math.min(4, Math.floor((midRank * 5) / n)) // 0 = lowest p .. 4 = highest p
    for (let k = start; k <= end; k++) difficulty[order[k].i] = 5 - bin
    start = end + 1
  }
  return difficulty
}
