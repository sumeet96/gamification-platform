/**
 * profile — infers per-topic strength from diagnostic answers.
 *
 * This is the step the single-stage demo faked by seeding strengths. Here we
 * MEASURE it: strength = share correct, but shrunk toward a 0.5 prior so that a
 * handful of items doesn't produce overconfident 0/1 estimates. This is a
 * miniature of the reliability point — with few items you can't be confident, so
 * you pull estimates toward the middle. The rigorous upgrade is adaptive testing
 * (CAT / Item Response Theory), noted as roadmap in the architecture doc.
 */

export interface TopicTally {
  correct: number;
  total: number;
}

/** Prior strength and its weight in "virtual items" (higher = more shrinkage). */
export const PRIOR = 0.5;
export const PRIOR_WEIGHT = 1;

export function inferStrength(tally: TopicTally): number {
  const { correct, total } = tally;
  return (correct + PRIOR * PRIOR_WEIGHT) / (total + PRIOR_WEIGHT);
}

export function inferStrengths(
  tallies: Record<string, TopicTally>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [topicId, tally] of Object.entries(tallies)) {
    out[topicId] = inferStrength(tally);
  }
  return out;
}

/** Weakness weight for practice sampling: weaker topics get sampled more. */
export function weakness(strength: number): number {
  return 1 - strength;
}
