import { describe, it, expect } from "vitest";
import { TOPICS, assignConditions } from "../src/data/topics";

function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("assignConditions", () => {
  it("always splits exactly 2 variable / 2 fixed, whatever the seed", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const c = assignConditions(seeded(seed));
      const vals = TOPICS.map((t) => c[t.id]);
      expect(vals).toHaveLength(4);
      expect(vals.filter((v) => v === "variable")).toHaveLength(2);
      expect(vals.filter((v) => v === "fixed")).toHaveLength(2);
    }
  });

  it("actually varies which topics are variable across seeds", () => {
    const a = JSON.stringify(assignConditions(seeded(1)));
    let differs = false;
    for (let seed = 2; seed <= 30; seed++) {
      if (JSON.stringify(assignConditions(seeded(seed))) !== a) differs = true;
    }
    expect(differs).toBe(true);
  });
});
