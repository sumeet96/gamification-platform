import { getSupabase } from "./supabaseClient";
import type { Condition } from "./rewardEngine";

/**
 * One event = one row in the `events` table (see supabase/migrations/0001_events.sql).
 * "Log from day one" (HANDOFF §6) without provisioning anything: if Supabase env
 * vars are absent, we console.info instead. The console path is the one exercised
 * this week; the DB path is dormant until a project exists.
 *
 * `stage` and the practice_continue/stop events are the engagement signal — they
 * let the within-subject analysis compare *voluntary persistence* under fixed vs
 * variable topics, which is the real dependent variable (points are just the stimulus).
 */
export type EventType =
  | "quiz_start"
  | "answer"
  | "reward_reveal"
  | "diagnostic_complete"
  | "practice_continue"
  | "practice_stop"
  | "quiz_end";

export type Stage = "diagnostic" | "practice" | "review";

export interface GameEvent {
  session_id: string;
  age_bracket: string;
  stage: Stage | null;
  topic: string | null;
  question_id: string | null;
  is_correct: boolean | null;
  condition: Condition | null;
  strength_at_time: number | null;
  base_reward: number | null;
  awarded_reward: number | null;
  event_type: EventType;
}

export async function logEvent(event: GameEvent): Promise<void> {
  const supabase = getSupabase();

  if (!supabase) {
    // eslint-disable-next-line no-console
    console.info("[event]", event.event_type, event);
    return;
  }

  const { error } = await supabase.from("events").insert(event);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[event] insert failed, falling back to console:", error.message, event);
  }
}
