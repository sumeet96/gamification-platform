// HIGH 2 fix (8 Aug 2026 adversarial review): tests for
// lib/games/crossword-serve-anchor.ts -- both the pure decision functions
// (resolveServeAnchor, checksSpentSinceAnchor), exercised directly on plain
// numbers, and the DB-touching glue (resolveCrosswordServeAnchor), exercised
// with a fakeSql mirroring tests/crossword-lever.test.ts's pattern.
//
// Covers both scenarios the fix is required to handle correctly:
//   - the exploit: a re-GET must not reset the scored elapsed time or the
//     check budget back to zero.
//   - the innocent reload: a genuine break longer than the token TTL must
//     start a fresh cycle, never lock a student out of their own board (the
//     package A1 lockout is the standing cautionary example for this class
//     of bug -- see AGENTS.md).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveServeAnchor,
  checksSpentSinceAnchor,
  resolveCrosswordServeAnchor,
  type ServedCandidate,
} from '../lib/games/crossword-serve-anchor.ts'

const TTL_MS = 30 * 60 * 1000 // mirrors BOARD_TOKEN_TTL_SECONDS (30 min)

// ---------------------------------------------------------------------------
// resolveServeAnchor -- pure
// ---------------------------------------------------------------------------

test('resolveServeAnchor: a single eligible serve anchors to itself', () => {
  const served: ServedCandidate[] = [{ nonce: 'n1', elapsedMs: 5_000, completed: false }]
  const anchor = resolveServeAnchor(TTL_MS, served)
  assert.deepEqual(anchor, { nonce: 'n1', elapsedMs: 5_000 })
})

test('resolveServeAnchor: THE EXPLOIT -- a re-GET must anchor to the OLDEST eligible serve, not the freshest', () => {
  // GET at T0 (20 minutes ago), solve offline, GET again right before
  // submitting (a few seconds ago). Both are within the TTL and neither is
  // completed -- the anchor must be the OLD one, so the scored elapsed
  // reflects the true ~20 minutes, not the freshly-minted nonce's ~0.
  const served: ServedCandidate[] = [
    { nonce: 'old', elapsedMs: 20 * 60 * 1000, completed: false },
    { nonce: 'fresh', elapsedMs: 2_000, completed: false },
  ]
  const anchor = resolveServeAnchor(TTL_MS, served)
  assert.equal(anchor?.nonce, 'old')
  assert.equal(anchor?.elapsedMs, 20 * 60 * 1000)
})

test('resolveServeAnchor: THE INNOCENT RELOAD -- a genuinely stale (expired) serve is excluded, never locking out a fresh attempt', () => {
  // The first serve is older than the TTL (a real break, or an abandoned
  // attempt from a previous session) -- its own board token would no longer
  // even pass readBoardToken's TTL check, so it must not anchor a NEW
  // attempt. The fresh serve anchors normally instead.
  const served: ServedCandidate[] = [
    { nonce: 'stale', elapsedMs: TTL_MS + 60_000, completed: false },
    { nonce: 'fresh', elapsedMs: 3_000, completed: false },
  ]
  const anchor = resolveServeAnchor(TTL_MS, served)
  assert.equal(anchor?.nonce, 'fresh')
  assert.equal(anchor?.elapsedMs, 3_000)
})

test('resolveServeAnchor: a completed serve is never eligible, even if it is the oldest', () => {
  // This student already completed an earlier serve of the SAME board (the
  // one live board got re-served in a later round) -- that old, already-
  // scored serve must not anchor a brand new attempt.
  const served: ServedCandidate[] = [
    { nonce: 'already-scored', elapsedMs: 10 * 60 * 1000, completed: true },
    { nonce: 'new-attempt', elapsedMs: 30_000, completed: false },
  ]
  const anchor = resolveServeAnchor(TTL_MS, served)
  assert.equal(anchor?.nonce, 'new-attempt')
})

test('resolveServeAnchor: no eligible candidate returns null (structurally "should not happen")', () => {
  assert.equal(resolveServeAnchor(TTL_MS, []), null)
  assert.equal(resolveServeAnchor(TTL_MS, [{ nonce: 'n1', elapsedMs: 5_000, completed: true }]), null)
  assert.equal(resolveServeAnchor(TTL_MS, [{ nonce: 'n1', elapsedMs: TTL_MS + 1, completed: false }]), null)
})

test('resolveServeAnchor: exact TTL boundary is still eligible (<=, not <)', () => {
  const anchor = resolveServeAnchor(TTL_MS, [{ nonce: 'n1', elapsedMs: TTL_MS, completed: false }])
  assert.equal(anchor?.nonce, 'n1')
})

// ---------------------------------------------------------------------------
// checksSpentSinceAnchor -- pure
// ---------------------------------------------------------------------------

test('checksSpentSinceAnchor: counts checks spent at or after the anchor serve, across nonce refreshes', () => {
  // anchorElapsedMs = 20 minutes ago. A check spent 18 minutes ago (elapsed
  // 18 min, happened AFTER the anchor serve) counts; one from before the
  // anchor serve (elapsed 25 min, i.e. BEFORE this cycle even started) does
  // not.
  const anchorElapsedMs = 20 * 60 * 1000
  const checks = [18 * 60 * 1000, 5 * 60 * 1000, 25 * 60 * 1000]
  assert.equal(checksSpentSinceAnchor(anchorElapsedMs, checks), 2)
})

test('checksSpentSinceAnchor: THE EXPLOIT -- checks spent under an earlier, since-refreshed nonce still count', () => {
  // Two checks spent right after the original GET (elapsed ~19-20 min), then
  // a re-GET, then one more check under the fresh nonce (elapsed ~1 min) --
  // all three must count against the SAME budget, not reset to a fresh 0
  // just because the token was re-issued partway through.
  const anchorElapsedMs = 20 * 60 * 1000
  const checks = [19.5 * 60 * 1000, 19 * 60 * 1000, 60 * 1000]
  assert.equal(checksSpentSinceAnchor(anchorElapsedMs, checks), 3)
})

test('checksSpentSinceAnchor: empty input is zero checks', () => {
  assert.equal(checksSpentSinceAnchor(10_000, []), 0)
})

// ---------------------------------------------------------------------------
// resolveCrosswordServeAnchor -- DB-touching glue, fakeSql
// ---------------------------------------------------------------------------

/** Two-call fakeSql: the first call is the board_served lookup, the second
 *  is the check_spent lookup -- mirrors the two queries
 *  resolveCrosswordServeAnchor issues in order. */
function fakeSqlSequence(responses: unknown[][]) {
  let call = 0
  return (async () => {
    const rows = responses[call] ?? []
    call += 1
    return rows
  }) as unknown as Parameters<typeof resolveCrosswordServeAnchor>[0]
}

test('resolveCrosswordServeAnchor: wires the anchor and checksUsed together end to end', async () => {
  const servedRows = [{ nonce: 'n1', elapsed_ms: 120_000, completed: false }]
  const checkRows = [{ elapsed_ms: 60_000 }, { elapsed_ms: 90_000 }]
  const sql = fakeSqlSequence([servedRows, checkRows])
  const result = await resolveCrosswordServeAnchor(sql, 's_1', 'b_1', 1800)
  assert.deepEqual(result, { nonce: 'n1', elapsedMs: 120_000, checksUsed: 2 })
})

test('resolveCrosswordServeAnchor: no eligible board_served row resolves to null', async () => {
  const sql = fakeSqlSequence([[]])
  const result = await resolveCrosswordServeAnchor(sql, 's_1', 'b_1', 1800)
  assert.equal(result, null)
})

test('resolveCrosswordServeAnchor: a thrown query error resolves to null, never throws', async () => {
  const sql = (async () => {
    throw new Error('connection reset')
  }) as unknown as Parameters<typeof resolveCrosswordServeAnchor>[0]
  const result = await resolveCrosswordServeAnchor(sql, 's_1', 'b_1', 1800)
  assert.equal(result, null)
})
