import type { Condition } from "@/lib/rewardEngine";

/**
 * Seeded Digital Transformation topics.
 *
 * `strength` is seeded here (in the full system it is AI-inferred).
 * `condition` assigns each topic to the fixed or variable reward schedule.
 *
 * The 4 topics form a counterbalanced 2x2 (strength x condition) — this is the
 * within-subject isolation design (Prompt 4, P1) baked into the seed data:
 * comparing fixed vs variable at matched strength isolates reward variance;
 * comparing weak vs strong at matched condition isolates anti-comfort-zone.
 */
export interface Topic {
  id: string;
  name: string;
  strength: number; // [0,1], seeded
  condition: Condition;
}

export const TOPICS: Topic[] = [
  { id: "data",     name: "Data & Analytics",  strength: 0.25, condition: "variable" }, // weak  x variable
  { id: "strategy", name: "Digital Strategy",  strength: 0.8,  condition: "variable" }, // strong x variable
  { id: "emerging", name: "Emerging Tech",     strength: 0.25, condition: "fixed" },    // weak  x fixed
  { id: "change",   name: "Change Management", strength: 0.8,  condition: "fixed" },    // strong x fixed
];

export function topicById(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}
