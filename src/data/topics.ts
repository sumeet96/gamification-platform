import type { Condition } from "@/lib/rewardEngine";

/**
 * Digital Transformation topics.
 *
 * `condition` (fixed | variable) is the hidden experimental manipulation,
 * counterbalanced 2:2 across topics. It is assigned per-topic and is NEVER
 * shown to the student (that would prime them and kill the uncertainty effect);
 * it lives only in the logs and the researcher view. In the real study the
 * fixed/variable topic assignment would be randomised per student.
 *
 * Note: topic `strength` is NO LONGER seeded here — it is MEASURED in the
 * diagnostic stage (see src/lib/profile.ts) and then drives the anti-comfort-zone
 * reward magnitude in the personalized practice stage.
 */
export interface Topic {
  id: string;
  name: string;
  condition: Condition;
}

export const TOPICS: Topic[] = [
  { id: "data",     name: "Data & Analytics",  condition: "variable" },
  { id: "strategy", name: "Digital Strategy",  condition: "fixed" },
  { id: "emerging", name: "Emerging Tech",     condition: "variable" },
  { id: "change",   name: "Change Management", condition: "fixed" },
];

export function topicById(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}
