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
  // Rank ascending by p: rank 0 = lowest p = hardest item in the run. Tie-break by original index
  // so two items with identical p always land the same way, run after run.
  const order = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p || a.i - b.i)
  const difficulty = Array(n)
  order.forEach(({ i }, rank) => {
    const bin = Math.floor((rank * 5) / n) // 0 (lowest p in the run) .. 4 (highest p in the run)
    difficulty[i] = 5 - bin // lowest p -> difficulty 5 (hardest); highest p -> difficulty 1 (easiest)
  })
  return difficulty
}
