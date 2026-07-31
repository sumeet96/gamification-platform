// Server-issued signed board token for match-the-following (package A1, FIX 1).
// Binds a POST to /api/match/submit to the exact board /api/match/board actually
// issued -- without this, a client can read the six terms out of one board
// response and replay them against a fabricated boards_completed value for
// unlimited points, or poll GET repeatedly to isolate each clue's term by
// intersecting shuffled term bags.
//
// Same HMAC pattern as lib/auth/session.ts: base64url JSON payload + '.' +
// HMAC-SHA256 signature, verified with timingSafeEqual, never trusted
// decoded-but-unverified. Deliberately reuses SESSION_SECRET (via the exported
// `secret()`) instead of minting a second secret -- one key to rotate, not two.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
// Explicit .ts extension (legal only because tsconfig.json sets
// allowImportingTsExtensions + noEmit, see that file's comment): this module
// is imported directly by tests/board-token.test.ts under node's native TS
// loader, which -- unlike webpack/Next's bundler resolution -- requires the
// real file extension.
import { secret } from './session.ts'

// 30 minutes: long enough that a student who genuinely takes their time filling
// six slots by hand never hits a spurious expiry, short enough that a token
// leaked via a console log or proxy isn't a standing replay risk.
export const BOARD_TOKEN_TTL_SECONDS = 30 * 60

// review-2 FIX 2: the event_type used to mark "this nonce is the current live,
// unredeemed token for this (student, session)". One marker row is written by
// app/api/match/board/route.ts per issued token; app/api/match/submit/route.ts
// reads the most recent marker for the (student, session) pair to decide
// whether a presented token has since been superseded by a newer GET, whether
// or not that newer board was ever submitted. A shared exported constant
// instead of the string literal duplicated in both routes, so they cannot
// drift out of typo-sync.
export const BOARD_TOKEN_ISSUED_EVENT_TYPE = 'board_token_issued'

export interface BoardTokenPayload {
  itemIds: string[] // sorted content_items ids that make up this board -- the token's claim
  nonce: string // random per-issue; the dedupe + replay key on submit (see submit/route.ts)
  studentId: string // the student this board was issued to, from the session cookie at issue time
  iat: number // unix seconds, issued-at
  // FIX 7: whether the board's difficulty was actually honoured (every row had a
  // non-null, ranked difficulty) or is an unranked fallback because term-item
  // calibration doesn't exist yet. Decided server-side at issue time so submit
  // cannot be tricked into logging a difficulty_level that was never honoured.
  difficultyHonored: boolean
}

function sign(payloadB64: string): string {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url')
}

/** Issue a signed token binding a board to the item ids actually served, the
 *  issuing student, and an issued-at timestamp. `itemIds` is sorted so the
 *  same board always produces the same claim regardless of serving order. */
export function issueBoardToken(
  itemIds: readonly string[],
  studentId: string,
  difficultyHonored: boolean
): string {
  const payload: BoardTokenPayload = {
    itemIds: [...itemIds].sort(),
    nonce: randomBytes(16).toString('base64url'),
    studentId,
    iat: Math.floor(Date.now() / 1000),
    difficultyHonored,
  }
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${payloadB64}.${sign(payloadB64)}`
}

/** Verify signature and expiry, and sanity-check the payload shape. Returns
 *  null on ANY failure -- bad signature, expired, malformed, tampered -- never
 *  throws on untrusted input. Same contract as readSession. */
export function readBoardToken(token: string | undefined | null): BoardTokenPayload | null {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot < 0) return null
  const payloadB64 = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!payloadB64 || !sig) return null

  const expected = sign(payloadB64)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  let payload: BoardTokenPayload
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (
    !Array.isArray(payload?.itemIds) ||
    !payload.itemIds.every((id) => typeof id === 'string') ||
    typeof payload?.nonce !== 'string' ||
    typeof payload?.studentId !== 'string' ||
    typeof payload?.iat !== 'number' ||
    typeof payload?.difficultyHonored !== 'boolean'
  ) {
    return null
  }
  if (payload.iat + BOARD_TOKEN_TTL_SECONDS < Math.floor(Date.now() / 1000)) return null
  return payload
}

/** review-2 FIX 2: true when `nonce` is still the current, redeemable token
 *  for a (student, session) pair -- i.e. it matches `latestIssuedNonce`, the
 *  most recently written BOARD_TOKEN_ISSUED_EVENT_TYPE marker for that pair.
 *  A null `latestIssuedNonce` (no marker found, or the lookup itself failed)
 *  is never current -- fail closed rather than let an unmarked nonce through.
 *  Pure comparison, split out of app/api/match/submit/route.ts so the
 *  "superseded" decision itself is unit tested without a DB; the query that
 *  produces `latestIssuedNonce` lives in that route. */
export function isTokenCurrent(latestIssuedNonce: string | null, nonce: string): boolean {
  return latestIssuedNonce !== null && latestIssuedNonce === nonce
}
