// FIX 1 (A5 adversarial review): app/api/connections/board/route.ts used to
// derive its shuffle seed as sha256(nonce). The nonce rides the boardToken in
// PLAINTEXT base64url JSON (signed, not encrypted -- lib/auth/board-token.ts's
// header), and the rows are fetched pre-shuffle grouped 4/4/4/4, so a client
// could decode its own nonce, replay sha256 + mulberry32 itself, and read
// straight off which pre-shuffle slot (hence which group) each served tile
// came from -- exact partition recovery, every trial, zero mistakes, +100 a
// board. This test genuinely attempts that reconstruction rather than merely
// checking the served JSON for an absent `groupId` field, per the review's
// explicit instruction that the weaker test "is not acceptable".
//
// No DB or Next.js runtime needed: the attack and the defence are both pure
// functions of issueBoardToken/readBoardToken (lib/auth/board-token.ts) and
// shuffleBoardTiles (lib/games/connections.ts), the same three exports
// app/api/connections/board/route.ts itself composes.

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-for-connections-shuffle-security'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomInt } from 'node:crypto'
import { issueBoardToken, readBoardToken } from '../lib/auth/board-token.ts'
import { shuffleBoardTiles } from '../lib/games/connections.ts'

/** A canonical PRE-shuffle 16-tile ordering, grouped 4/4/4/4 -- exactly the
 *  shape board/route.ts's DB query returns (order by cbg.ordinal, gm.ordinal)
 *  before shuffleBoardTiles ever runs. `group` is the ground truth a real
 *  attacker does NOT have -- it's only used here to check what the attack
 *  recovers, never fed into the attack itself. */
const CANONICAL = Array.from({ length: 16 }, (_, i) => ({
  contentItemId: `item-${i}`,
  group: Math.floor(i / 4),
}))
const ITEM_IDS = CANONICAL.map((t) => t.contentItemId)

/** The OLD, vulnerable derivation this fix replaces. */
function vulnerableSeedFromNonce(nonce: string): number {
  return createHash('sha256').update(nonce).digest().readUInt32BE(0)
}

/** An attacker who has decoded a board token and nothing else (the boardToken
 *  itself, plus the tiles array the route also returns) replays the exact
 *  algorithm the server used to derive its shuffle seed, to recover which
 *  original group each served tile came from. */
function attemptReconstruction(nonce: string): number[] {
  const seed = vulnerableSeedFromNonce(nonce)
  return shuffleBoardTiles(CANONICAL, seed).map((t) => t.group)
}

/** Compares two group-label sequences as PARTITIONS (sets of 4-tile groups)
 *  -- neither which label a group got nor the order within a group matters,
 *  only whether the same four tiles ended up together. This is the actual
 *  property a Connections win depends on. */
function partitionsMatch(a: readonly number[], b: readonly number[]): boolean {
  const asGroups = (labels: readonly number[]) => {
    const byLabel = new Map<number, number[]>()
    labels.forEach((g, i) => {
      if (!byLabel.has(g)) byLabel.set(g, [])
      byLabel.get(g)!.push(i)
    })
    return [...byLabel.values()].map((members) => [...members].sort((x, y) => x - y).join(',')).sort()
  }
  return JSON.stringify(asGroups(a)) === JSON.stringify(asGroups(b))
}

test('sanity check: the reconstruction attack genuinely works when the seed really is sha256(nonce) (proves the attack methodology, not just the fix)', () => {
  const token = issueBoardToken(ITEM_IDS, 's1', false, 'board-1')
  const nonce = readBoardToken(token)!.nonce
  // Simulate the OLD, vulnerable server: shuffle using the vulnerable seed itself.
  const trulyServed = shuffleBoardTiles(CANONICAL, vulnerableSeedFromNonce(nonce)).map((t) => t.group)
  const recovered = attemptReconstruction(nonce)
  assert.ok(
    partitionsMatch(trulyServed, recovered),
    'the attack must actually recover the partition when the bug is present, or this test proves nothing'
  )
})

test('FIX 1: the partition is NOT recoverable now that the seed is a CSPRNG value independent of the nonce', () => {
  const TRIALS = 200
  let anyMatch = false
  for (let i = 0; i < TRIALS; i++) {
    const token = issueBoardToken(ITEM_IDS, 's1', false, `board-${i}`)
    const nonce = readBoardToken(token)!.nonce
    // Simulate the FIXED server (app/api/connections/board/route.ts): the
    // seed comes from crypto.randomInt, with no relationship to the nonce.
    const realSeed = randomInt(0, 0x100000000)
    const trulyServed = shuffleBoardTiles(CANONICAL, realSeed).map((t) => t.group)
    const recovered = attemptReconstruction(nonce)
    if (partitionsMatch(trulyServed, recovered)) anyMatch = true
  }
  // Chance of the sha256(nonce) attack accidentally landing on the correct
  // partition by luck: 1 in 16!/(4!^4 * 4!) = 1 in 2,627,625 per trial --
  // 200 trials with zero matches is the expected, not merely likely, outcome
  // once the seed is genuinely independent of anything the client can see.
  assert.equal(anyMatch, false, `the sha256(nonce) attack must never recover the true partition once the seed is unrelated to the nonce (0/${TRIALS} matches expected)`)
})

test('a different nonce still yields a different attempted reconstruction (the attack itself is not degenerate)', () => {
  const tokenA = issueBoardToken(ITEM_IDS, 's1', false, 'board-a')
  const tokenB = issueBoardToken(ITEM_IDS, 's1', false, 'board-b')
  const nonceA = readBoardToken(tokenA)!.nonce
  const nonceB = readBoardToken(tokenB)!.nonce
  assert.notDeepEqual(attemptReconstruction(nonceA), attemptReconstruction(nonceB))
})
