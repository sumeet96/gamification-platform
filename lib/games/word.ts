// Package A3: pure logic for choose-the-right-word, mirroring lib/games/match.ts's
// separation of pure comparison/scoring from the DB-backed route (framework-free
// and DB-free so it's testable in isolation and reusable by the answer route).
//
// Correctness comparison itself is NOT duplicated here -- app/api/word/answer/route.ts
// reuses matchesTerm from ./match directly (case/punctuation/quote-insensitive,
// accepts declared variants, deliberately no fuzzy matching; see that file's header
// for why). What lives here is specific to choose-the-right-word: which strings an
// item's options could ever have been, so a submission can be checked against that
// set before it's trusted as "one of the choices the student was actually shown."

/** Up to 3 distractors are ever offered alongside the term. A DETERMINISTIC
 *  slice (the first 3 in `distractors` order, never a random sample) -- so
 *  the answer route can recompute the exact same option set the question
 *  route could have served without needing a signed token to carry "which 3"
 *  across the two requests. Display order is shuffled independently by the
 *  question route; this constant only bounds which strings ever counted as
 *  an option in the first place. */
export const MAX_DISTRACTORS = 3

/** The bare set of option strings this item could have produced -- term
 *  first, distractors after, BEFORE the question route shuffles them for
 *  display. */
export function itemOptions(term: string, distractors: readonly string[]): string[] {
  return [term, ...distractors.slice(0, MAX_DISTRACTORS)]
}

/** Whether `selectedText` is literally one of the strings this item's GET
 *  response could have contained -- exact string membership, not the
 *  normalised comparison matchesTerm uses for scoring. A fabricated string
 *  that happens to normalise the same as the term is still rejected here;
 *  the answer route uses this to 400 before it ever reaches scoring, so
 *  matchesTerm's normalisation never has to defend against arbitrary client
 *  input. */
export function isOfferedOption(selectedText: string, term: string, distractors: readonly string[]): boolean {
  return itemOptions(term, distractors).includes(selectedText)
}
