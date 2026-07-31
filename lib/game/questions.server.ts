// SERVER-ONLY companion to lib/game/questions.ts. Holds the seed answer key --
// this is the only place in the codebase where the seed bank's correct
// answers live (package Q1 rework).
//
// Do NOT import this file from a 'use client' component, or from any module a
// client file imports transitively. There is no build-time enforcement here
// (the `server-only` npm package would give us that, but it isn't an existing
// dependency and adding one needs sign-off per CLAUDE.md) -- so the boundary
// is enforced by keeping the answer key in a file only route handlers touch.
// Today that's exactly two importers: app/api/questions/route.ts (which
// re-exports QUESTIONS from lib/game/questions.ts, never this file) and
// app/api/answer/route.ts (the scoring route, which needs the key).
//
// The answer key is stored as a flat id -> index map, deliberately NOT merged
// back onto the Question objects from lib/game/questions.ts -- that keeps
// stem/options/difficulty (client-safe) and answer (server-only) in two
// physically separate literals, so there is no single "Question with answer"
// object anywhere that a future refactor could accidentally export from a
// client-reachable module.
import { QUESTIONS, type Question } from './questions'

const SEED_ANSWERS: Readonly<Record<string, number>> = {
  q1: 0, q2: 0, q3: 1, q4: 1,
  q5: 1, q6: 0, q7: 1, q8: 1,
  q9: 1, q10: 1, q11: 1, q12: 1,
  q13: 1, q14: 1, q15: 1, q16: 1,
  q17: 1, q18: 1, q19: 1, q20: 1,
}

/** Look up the seed bank's answer for `id`. Returns null if `id` isn't a seed
 *  question -- the caller (app/api/answer/route.ts) treats that exactly like
 *  "not found in content_items either" and 404s. */
export function findSeedAnswer(id: string): { answer: number; optionCount: number } | null {
  const q: Question | undefined = QUESTIONS.find((qq) => qq.id === id)
  const answer = SEED_ANSWERS[id]
  if (!q || typeof answer !== 'number') return null
  return { answer, optionCount: q.options.length }
}
