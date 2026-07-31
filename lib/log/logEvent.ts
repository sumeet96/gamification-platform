// Client-side event logging. Posts to /api/events (which writes to Neon when
// configured, else no-ops) and mirrors to the console in dev. Fire-and-forget.

// 'question_answered' is deliberately absent -- that event is scored and written
// server-side only, from app/api/answer/route.ts (package Q1). Leaving it out of
// this union makes "the client cannot emit a scored event" a type error, not just
// a rule; app/api/events/route.ts still rejects it at runtime as a backstop since
// this type doesn't constrain a raw fetch().
export type EventType =
  | 'session_start'
  | 'round_start'
  | 'round_continue'
  | 'round_stop'

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
