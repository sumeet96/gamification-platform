// FIX 1 (A1 rework): the signed board token is what binds a /api/match/submit
// POST to the exact board GET /api/match/board actually issued. These tests
// exercise lib/auth/board-token.ts directly -- no DB, no HTTP -- covering the
// three things the exploit report cared about: a valid token round-trips, a
// tampered token is rejected, and an expired token is rejected.

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-for-board-token-tests'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import {
  issueBoardToken,
  readBoardToken,
  isTokenCurrent,
  BOARD_TOKEN_TTL_SECONDS,
  type BoardTokenPayload,
} from '../lib/auth/board-token.ts'
import { secret } from '../lib/auth/session.ts'

/** Build a token the exact way issueBoardToken does, but with a caller-chosen
 *  `iat` -- lets the expiry test construct a genuinely-expired-but-otherwise-
 *  valid token instead of just asserting on the module's internals. */
function signTokenWithIat(payload: Omit<BoardTokenPayload, 'nonce'> & { nonce?: string }): string {
  const full: BoardTokenPayload = { nonce: 'test-nonce', ...payload }
  const payloadB64 = Buffer.from(JSON.stringify(full)).toString('base64url')
  const sig = createHmac('sha256', secret()).update(payloadB64).digest('base64url')
  return `${payloadB64}.${sig}`
}

test('a freshly issued token verifies and carries back exactly what was issued', () => {
  const token = issueBoardToken(['b', 'a', 'c'], 's_student1', false)
  const payload = readBoardToken(token)
  assert.ok(payload)
  // Sorted regardless of the order passed in -- the claim is "this set of ids", not an order.
  assert.deepEqual(payload!.itemIds, ['a', 'b', 'c'])
  assert.equal(payload!.studentId, 's_student1')
  assert.equal(payload!.difficultyHonored, false)
  assert.equal(typeof payload!.nonce, 'string')
  assert.ok(payload!.nonce.length > 0)
})

test('two tokens for the same board get different nonces', () => {
  const t1 = issueBoardToken(['a', 'b'], 's_student1', true)
  const t2 = issueBoardToken(['a', 'b'], 's_student1', true)
  assert.notEqual(readBoardToken(t1)!.nonce, readBoardToken(t2)!.nonce)
})

test('garbage, empty, and malformed tokens are rejected, never thrown on', () => {
  assert.equal(readBoardToken(null), null)
  assert.equal(readBoardToken(undefined), null)
  assert.equal(readBoardToken(''), null)
  assert.equal(readBoardToken('not-a-token'), null)
  assert.equal(readBoardToken('missing-signature.'), null)
  assert.equal(readBoardToken('.no-payload'), null)
})

test('a tampered payload fails signature verification', () => {
  const token = issueBoardToken(['a', 'b', 'c'], 's_student1', false)
  const [payloadB64, sig] = token.split('.')
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  // Attacker adds an extra item id, hoping to walk away with a bigger board.
  payload.itemIds.push('d')
  const tamperedB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const tampered = `${tamperedB64}.${sig}`
  assert.equal(readBoardToken(tampered), null)
})

test('a tampered signature is rejected even if it happens to be the right length', () => {
  const token = issueBoardToken(['a', 'b'], 's_student1', false)
  const [payloadB64, sig] = token.split('.')
  const flipped = sig[0] === 'A' ? 'B' + sig.slice(1) : 'A' + sig.slice(1)
  assert.equal(readBoardToken(`${payloadB64}.${flipped}`), null)
})

test('a token signed with a different secret is rejected', () => {
  const token = issueBoardToken(['a', 'b'], 's_student1', false)
  const originalSecret = process.env.SESSION_SECRET
  process.env.SESSION_SECRET = 'a-completely-different-secret'
  try {
    assert.equal(readBoardToken(token), null)
  } finally {
    process.env.SESSION_SECRET = originalSecret
  }
})

test('an expired token is rejected even with a valid signature', () => {
  const now = Math.floor(Date.now() / 1000)
  const expired = signTokenWithIat({
    itemIds: ['a', 'b'],
    studentId: 's_student1',
    difficultyHonored: false,
    iat: now - BOARD_TOKEN_TTL_SECONDS - 1,
  })
  assert.equal(readBoardToken(expired), null)
})

test('a token issued one second inside the TTL still verifies (boundary check)', () => {
  const now = Math.floor(Date.now() / 1000)
  const stillValid = signTokenWithIat({
    itemIds: ['a', 'b'],
    studentId: 's_student1',
    difficultyHonored: false,
    iat: now - BOARD_TOKEN_TTL_SECONDS + 1,
  })
  assert.ok(readBoardToken(stillValid))
})

// Package A5 (Connections): boardId is an optional 4th arg, added for a game
// whose board is a pre-authored atomic unit rather than composed at request
// time (see lib/auth/board-token.ts's header). Backward compatibility is the
// property under test here -- every call above this point uses the original
// 3-arg form and must keep working unchanged.
test('boardId is optional: an omitted boardId round-trips as undefined, not a decode failure', () => {
  const token = issueBoardToken(['a', 'b'], 's_student1', false)
  const payload = readBoardToken(token)
  assert.ok(payload)
  assert.equal(payload!.boardId, undefined)
})

test('boardId round-trips when supplied', () => {
  const token = issueBoardToken(['a', 'b', 'c', 'd'], 's_student1', false, 'board-42')
  const payload = readBoardToken(token)
  assert.ok(payload)
  assert.equal(payload!.boardId, 'board-42')
})

test('a tampered boardId fails signature verification, same as any other field', () => {
  const token = issueBoardToken(['a', 'b'], 's_student1', false, 'board-1')
  const [payloadB64, sig] = token.split('.')
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  payload.boardId = 'board-2'
  const tamperedB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  assert.equal(readBoardToken(`${tamperedB64}.${sig}`), null)
})

test('a non-string boardId injected into an otherwise-valid payload is rejected', () => {
  // Can't go through issueBoardToken (it's typed to a string) -- construct the
  // payload directly, the same way the malformed-payload tests elsewhere in
  // this file do, to prove readBoardToken's own runtime guard (not just
  // TypeScript) rejects it.
  const bad = { itemIds: ['a', 'b'], nonce: 'n', studentId: 's1', iat: Math.floor(Date.now() / 1000), difficultyHonored: false, boardId: 123 }
  const payloadB64 = Buffer.from(JSON.stringify(bad)).toString('base64url')
  const sig = createHmac('sha256', secret()).update(payloadB64).digest('base64url')
  assert.equal(readBoardToken(`${payloadB64}.${sig}`), null)
})

test('a token issued to one student does not silently verify for another (payload carries studentId)', () => {
  const token = issueBoardToken(['a', 'b'], 's_student1', false)
  const payload = readBoardToken(token)
  assert.ok(payload)
  // readBoardToken itself doesn't know who's asking -- the caller (submit route)
  // is responsible for comparing payload.studentId to the session's student id.
  // This test just pins that the field is present and correct so that check is
  // possible at all.
  assert.equal(payload!.studentId, 's_student1')
  assert.notEqual(payload!.studentId, 's_student2')
})

// review-2 FIX 2: isTokenCurrent is the pure "superseded" decision extracted
// out of app/api/match/submit/route.ts so it is unit-testable without a live
// events table -- see that route's latest-marker query and the function's
// own doc comment for the DB-backed half of this check.
test('isTokenCurrent: matches the latest issued nonce -- current', () => {
  assert.equal(isTokenCurrent('nonce-a', 'nonce-a'), true)
})

test('isTokenCurrent: a different, older nonce is superseded', () => {
  // A newer GET /api/match/board issued 'nonce-b' after this token's
  // 'nonce-a' was minted -- 'nonce-a' must never redeem again.
  assert.equal(isTokenCurrent('nonce-b', 'nonce-a'), false)
})

test('isTokenCurrent: no marker found at all (null) is never current', () => {
  // Fail closed: an unmarked nonce (lookup found nothing, or the marker write
  // itself failed at issue time) is rejected, not treated as trustworthy.
  assert.equal(isTokenCurrent(null, 'nonce-a'), false)
})
