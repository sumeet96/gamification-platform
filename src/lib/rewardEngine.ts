/**
 * rewardEngine — the design thesis in code.
 *
 * Two orthogonal dials, kept separate on purpose (see docs/venture-analysis
 * Prompt 4, pivot P1 — the primary experiment isolates ONE variable):
 *
 *   Dial 1 — MAGNITUDE (anti-comfort-zone): base(s) pays more in weak topics.
 *   Dial 2 — VARIANCE (the isolated experimental manipulation): a topic is run
 *            in either `fixed` or `variable` condition. Both conditions share the
 *            SAME expected value (base), differing ONLY in variance — so a
 *            fixed-vs-variable comparison at matched strength isolates the effect
 *            of reward *uncertainty* (the Fiorillo/Tobler/Schultz mechanic).
 *
 * All functions are pure with an injectable RNG (default Math.random) so the
 * within-subject property is unit-testable and reproducible.
 */

export type Condition = "fixed" | "variable";

/** Low outcome multiplier for the variable condition's "miss". */
export const M_LO = 0.25;

/** Dial 1: anti-comfort-zone base reward. s = topic strength in [0,1]. */
export function baseReward(s: number): number {
  return Math.round(10 + 40 * (1 - s));
}

/** Variable condition: probability of the "hit" (high) outcome. */
export function hitProbability(s: number): number {
  return 0.5 + 0.5 * s;
}

/**
 * The "hit" multiplier, chosen so that E[multiplier] === 1 exactly:
 *   E[m] = p * hiMultiplier(p) + (1 - p) * M_LO === 1
 * This is what makes fixed and variable share the same expected value.
 */
export function hiMultiplier(p: number): number {
  return (1 - M_LO * (1 - p)) / p;
}

export interface RewardResult {
  base: number;
  multiplier: number;
  awarded: number;
  hit: boolean;
  condition: Condition;
}

/**
 * Compute a reward for a correct answer.
 * - fixed:    deterministic, always pays `base` (variance = 0).
 * - variable: two-outcome draw with E[awarded] === base, but nonzero variance.
 */
export function computeReward(
  s: number,
  condition: Condition,
  rng: () => number = Math.random,
): RewardResult {
  const base = baseReward(s);

  if (condition === "fixed") {
    return { base, multiplier: 1, awarded: base, hit: true, condition };
  }

  const p = hitProbability(s);
  const hit = rng() < p;
  const multiplier = hit ? hiMultiplier(p) : M_LO;
  return { base, multiplier, awarded: Math.round(base * multiplier), hit, condition };
}
