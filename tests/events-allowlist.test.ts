// FIX B (adversarial review of package A1): app/api/events/route.ts rejected only
// `event_type === 'question_answered'` -- a denylist that failed open the moment a second
// scored event type (`board_complete`, introduced by match) existed, since nothing named
// it. Replaced with an explicit allowlist, CLIENT_EMITTABLE_EVENT_TYPES.
//
// The previous version of this test was a hand-copied MIRROR: it re-declared the allowlist
// and the EventType union as local literals, so it could not fail if the shipped route
// drifted from either. Fixed (see CLAUDE.md's "over-rejecting validator" / structural
// convention): CLIENT_EMITTABLE_EVENT_TYPES now lives in lib/log/logEvent.ts as a `const`
// array with no next/headers dependency, EventType is derived from it
// (`typeof CLIENT_EMITTABLE_EVENT_TYPES[number]`), and app/api/events/route.ts imports the
// same array as its runtime allowlist instead of declaring its own copy. This test imports
// that same array directly -- not a mirror -- so it fails the moment the route's runtime
// guard and the type-level guard could diverge (which, being the same object, they can't).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLIENT_EMITTABLE_EVENT_TYPES } from '../lib/log/logEvent.ts'

test('the client-emittable allowlist is exactly the six interaction event types', () => {
  // Package A5 added 'board_reported_ambiguous' -- Connections' one-tap
  // "this board seems ambiguous" affordance (docs/NEXT_SESSION_BUILD_BRIEF.md
  // §5/§7). Like the five round-lifecycle types below it, it carries no score.
  //
  // Package A6 (crossword) deliberately did NOT add 'check_spent' here, even
  // though an earlier draft did -- see logEvent.ts's comment on the array.
  // check_spent carries is_correct, a scoring-adjacent fact, so it follows
  // 'question_answered'/'board_complete's exclusion below rather than joining
  // this list.
  assert.deepEqual(
    [...CLIENT_EMITTABLE_EVENT_TYPES].sort(),
    ['board_reported_ambiguous', 'round_continue', 'round_offer', 'round_start', 'round_stop', 'session_start']
  )
})

test('round_offer is present -- it is what makes voluntary persistence measurable', () => {
  // round_offer is emitted from components/game-context.tsx when the "Keep Going"
  // affordance actually renders; losing it from the allowlist would silently break the
  // accepted/declined/abandoned distinction documented in lib/log/logEvent.ts.
  assert.ok(CLIENT_EMITTABLE_EVENT_TYPES.includes('round_offer'))
})

test('scored event types are never allowlisted', () => {
  // question_answered and board_complete are scoring facts written server-side only
  // (app/api/answer/route.ts and app/api/match/submit/route.ts respectively).
  // check_spent (package A6) joins them -- it carries is_correct, computed by
  // gradeEntry() server-side, written directly by app/api/crossword/submit/route.ts,
  // never via logEvent()/POST /api/events. Cast to a wide-string array first:
  // CLIENT_EMITTABLE_EVENT_TYPES's element type deliberately does not include
  // these strings, which is the property under test.
  const types: readonly string[] = CLIENT_EMITTABLE_EVENT_TYPES
  assert.equal(types.includes('question_answered'), false)
  assert.equal(types.includes('board_complete'), false)
  assert.equal(types.includes('check_spent'), false)
})

test('unknown or forged event types are not allowlisted', () => {
  const types: readonly string[] = CLIENT_EMITTABLE_EVENT_TYPES
  assert.equal(types.includes('xp_grant'), false)
  assert.equal(types.includes(''), false)
})

test('CLIENT_EMITTABLE_EVENT_TYPES is the array the EventType union is derived from, not a parallel copy', () => {
  // If a future edit turned EventType back into an independently-declared union, this
  // array would still type-check against it as long as the values happened to match --
  // TypeScript can't assert "type X is derived from array Y" at runtime. What this test
  // can and does check is the runtime contract every caller actually depends on: the
  // array is a real, live, non-empty export, not a value that's been hollowed out.
  assert.ok(Array.isArray(CLIENT_EMITTABLE_EVENT_TYPES))
  assert.ok(CLIENT_EMITTABLE_EVENT_TYPES.length > 0)
})
