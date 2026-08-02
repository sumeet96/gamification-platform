// Extracted from scripts/calibrate-difficulty.mjs's --from path (commit 116a3eb), which needed this
// exact join first: scripts/spike-simulate-difficulty.mjs run files carry only an array index per
// row (`{i, p, ...}`), never an item id, so identity has to be recovered by joining row i to
// items[i]. scripts/analyse-item-gap.mjs needs the identical join for its two arms, and the "extract,
// don't copy" rule (CLAUDE.md) means this lives once, not twice — a second copy is exactly the kind
// of drift the project has a scar from (the pre-extraction answer-commit path).
//
// Four guards, in this order, all of them load-bearing:
//   1. duplicate id in `items` -> the index-to-id join would be ambiguous (whichever row lands last
//      on a shared id wins silently).
//   2. `rows.length !== items.length` -> the two files are not the exact pair the run was produced
//      from; refuse to guess a join.
//   3. `rows[i].i !== i` -> the run file's own row order does not match its own recorded index, so
//      positional joining would silently mislabel items.
//   4. `rows[i].prompt !== items[i].prompt` -> length and `i` only prove the two files have the same
//      SHAPE, not that row i is still item i (e.g. items were regenerated and rows shifted). Prompt
//      text is carried in both files and catches that drift directly.
//
// Throws a plain Error on any guard failure — callers that want the project's `die()` exit-1 style
// catch it and pass `err.message` through unchanged.

/**
 * @param {Array<{i: number, p: number, prompt: string}>} rows - a simulator run file's `.rows`
 * @param {Array<{id: string, prompt: string}>} items - the questions fixture the run was produced from
 * @param {{ runLabel?: string, itemsLabel?: string }} [labels] - file names/descriptions for error text
 * @returns {Array<{id: string, i: number, p: number, prompt: string, label: string, item: object}>}
 */
export function joinRunToItems(rows, items, { runLabel = 'the run file', itemsLabel = 'the items file' } = {}) {
  {
    const seen = new Map()
    for (const it of items) seen.set(it.id, (seen.get(it.id) ?? 0) + 1)
    const dupes = [...seen].filter(([, c]) => c > 1).map(([id]) => id)
    if (dupes.length) throw new Error(`${itemsLabel} has duplicate id(s), so the index-to-id join is ambiguous: ${dupes.slice(0, 5).join(', ')}${dupes.length > 5 ? ', ...' : ''}.`)
  }
  if (rows.length !== items.length) throw new Error(`${runLabel} has ${rows.length} row(s) but ${itemsLabel} has ${items.length} item(s) — they must be the exact pair the run was produced from. Refusing to guess a join.`)
  rows.forEach((r, i) => { if (r.i !== i) throw new Error(`${runLabel} row ${i} has i=${r.i}, not ${i} — the run file's row order does not match its own recorded index, so joining to ${itemsLabel} by position would silently mislabel items.`) })
  // Length and `i` matching only prove the two files have the same SHAPE, not that row i in one file
  // is still row i in the other -- a fixture regenerated in place can insert rows at pseudorandom
  // positions and shift the tail. Compare content, which is right there: `prompt` is carried in both.
  rows.forEach((r, i) => { if (r.prompt !== items[i].prompt) throw new Error(`${runLabel} row ${i}'s prompt does not match ${itemsLabel} item ${i}'s prompt -- the two files have drifted out of alignment (e.g. ${itemsLabel} was regenerated and rows shifted), so joining by index would silently apply this row's data to a different item. Regenerate ${runLabel} against the current ${itemsLabel} before re-applying.`) })

  return rows.map((r, i) => ({
    id: items[i].id,
    i,
    p: r.p,
    prompt: r.prompt,
    label: items[i].term ?? items[i].topic ?? r.topic ?? '',
    item: items[i],
  }))
}
