// Client-side event logging. Posts to /api/events (which writes to Neon when
// configured, else no-ops) and mirrors to the console in dev. Fire-and-forget.

// 'question_answered' is deliberately absent -- that event is scored and written
// server-side only, from app/api/answer/route.ts (package Q1). Leaving it out of
// this array makes "the client cannot emit a scored event" a type error, not just
// a rule; app/api/events/route.ts still rejects it at runtime as a backstop since
// the type alone doesn't constrain a raw fetch(). Declared as a `const` array
// (rather than a type literal with a hand-kept-in-sync runtime Set elsewhere) so
// `EventType` below is DERIVED from it: app/api/events/route.ts imports this same
// array as its runtime allowlist, so the type-level guard and the runtime backstop
// cannot drift apart the way two independently-maintained lists could.
export const CLIENT_EMITTABLE_EVENT_TYPES = [
  'session_start',
  'round_start',
  'round_offer', // emitted when the results screen actually renders the "Keep Going"
  // affordance -- i.e. the student was genuinely given the chance to continue. It
  // carries no score, so (like the others here) it is safe as a client-emitted type.
  // Pairs with 'round_continue' (accepted) and 'round_stop' (declined); silence after
  // this event with neither of those two means the round was abandoned mid-decision.
  'round_continue',
  'round_stop',
  // STANDING RULE (added when abandonRound was extracted, see lib/game/game-context.tsx):
  // every path that ends a started round WITHOUT it completing -- a board/question
  // fetch failure, a navigation away mid-round, an unrecoverable submit error, an
  // explicit give-up -- MUST call abandonRound() so the round's number is consumed
  // exactly once. Quiz's abandoned-round bug (1 Aug 2026) and match's identical
  // reintroduction on its own error path (package A1) were each a caller forgetting
  // to do this on one exit path; a new game (A3 and beyond) is the next chance to
  // forget it again. A round_stop that follows a round_offer for the same round is a
  // deliberate decline, not an abandonment -- that case stays a direct emit() at its
  // own call site (see app/results/page.tsx, app/games/match/page.tsx's stopRound())
  // and must never go through abandonRound.
  // Package A5 (Connections): a one-tap "this board seems ambiguous" affordance
  // (docs/NEXT_SESSION_BUILD_BRIEF.md §5/§7) -- the only client-emitted type that
  // isn't part of the round lifecycle above. It carries no score, same reasoning
  // as the round_* types: safe for the client to emit directly rather than
  // requiring a server-scored route.
  'board_reported_ambiguous',
  // 'check_spent' (package A6, crossword, db/014) is DELIBERATELY ABSENT here,
  // for the exact same reason 'question_answered' is absent (see the file
  // header above): it carries is_correct, a scoring-adjacent fact, computed
  // server-side by gradeEntry() (lib/games/crossword.ts) from the posted grid
  // state -- never something the client itself knows authoritatively. An
  // earlier draft of this array included it with a large caveat comment
  // saying "don't actually emit this via logEvent()" -- that defeated the
  // entire point of this file's design, which is to make "the client cannot
  // emit a scored event" a compile error instead of a rule someone has to
  // remember to follow. check_spent is written via its own direct INSERT
  // inside the authenticated /api/crossword/submit route, exactly like
  // question_answered/board_complete/guess_submitted already are -- it never
  // goes through logEvent()/POST /api/events, and therefore never needs to be
  // a member of EventType at all.
] as const

export type EventType = (typeof CLIENT_EMITTABLE_EVENT_TYPES)[number]

export interface GameEvent {
  session_id: string
  event_type: EventType
  // The student id the *client* believes it is playing as (from the last successful
  // /api/auth/me fetch this tab made). Never trusted as the identity to write — the
  // server always attributes from the session cookie. This is only a mismatch signal:
  // if it disagrees with the cookie (a second student logged in on another tab, this
  // tab's identity going stale), the server downgrades the row to a null student_id
  // instead of writing it to whoever the cookie now belongs to. Omitted when the
  // client doesn't know its student id yet (or the lookup failed) — never a guess.
  client_student_id?: string | null
  game_type?: string | null
  mode?: string | null
  lever?: string | null
  round?: number | null
  question_id?: string | null
  // FIX 6 (A5 adversarial review): board_reported_ambiguous carried no way to
  // join back to a board -- its whole purpose (db/011's header: reviewing a
  // spike in reports to retire a board) is impossible without one. Opaque
  // from the client's point of view: events.board_id is deliberately NOT a
  // foreign key (db/011), and /api/events/route.ts validates this as a plain
  // string, never a path to write a scoring column.
  board_id?: string | null
  difficulty_level?: number | null
  time_limit?: number | null
  time_taken_ms?: number | null
  is_correct?: boolean | null
  points_delta?: number | null
  negative_applied?: boolean | null
  net_after?: number | null
}

export function logEvent(e: GameEvent): void {
  if (typeof window === 'undefined') return
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.info('[event]', e.event_type, e)
  }
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(e),
      keepalive: true, // survives the page navigation that some events ride on
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}
