import type { Condition } from "@/lib/rewardEngine";

/**
 * Digital Transformation topics.
 *
 * `condition` (fixed | variable) is NOT baked into a topic — it is the hidden
 * experimental manipulation and is assigned PER STUDENT at runtime by
 * assignConditions(), counterbalanced 2:2 and randomised over topics. Randomising
 * which topics are variable (rather than fixing it) stops the manipulation from
 * correlating with any particular topic's content across the cohort.
 *
 * Topic `strength` is MEASURED in the diagnostic (src/lib/profile.ts), not seeded.
 */
export interface Topic {
  id: string;
  name: string;
}

export const TOPICS: Topic[] = [
  { id: "data",     name: "Data & Analytics" },
  { id: "strategy", name: "Digital Strategy" },
  { id: "emerging", name: "Emerging Tech" },
  { id: "change",   name: "Change Management" },
];

export function topicById(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}

/**
 * Balanced random assignment of topics to conditions: exactly half variable,
 * half fixed (rounded down for odd counts). Injectable RNG for testability.
 */
export function assignConditions(rng: () => number = Math.random): Record<string, Condition> {
  const ids = TOPICS.map((t) => t.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const half = Math.floor(ids.length / 2);
  const out: Record<string, Condition> = {};
  ids.forEach((id, i) => {
    out[id] = i < half ? "variable" : "fixed";
  });
  return out;
}
