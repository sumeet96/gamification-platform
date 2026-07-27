// Client-side event logging. Posts to /api/events (which writes to Neon when
// configured, else no-ops) and mirrors to the console in dev. Fire-and-forget.

export type EventType =
  | 'session_start'
  | 'round_start'
  | 'question_answered'
  | 'round_continue'
  | 'round_stop'

export interface GameEvent {
  session_id: string
  event_type: EventType
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
