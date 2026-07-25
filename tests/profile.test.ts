import { describe, it, expect } from "vitest";
import { inferStrength, inferStrengths, weakness } from "../src/lib/profile";

describe("profile.inferStrength", () => {
  it("shrinks toward 0.5 with few items (reliability)", () => {
    // 2/2 correct is NOT 1.0 — pulled toward the 0.5 prior.
    expect(inferStrength({ correct: 2, total: 2 })).toBeCloseTo(2.5 / 3, 5);
    // 0/2 is NOT 0.0 — pulled up toward 0.5.
    expect(inferStrength({ correct: 0, total: 2 })).toBeCloseTo(0.5 / 3, 5);
    // 1/2 lands exactly at the prior.
    expect(inferStrength({ correct: 1, total: 2 })).toBeCloseTo(0.5, 5);
  });

  it("moves toward the raw rate as items accumulate", () => {
    const few = inferStrength({ correct: 2, total: 2 });
    const many = inferStrength({ correct: 20, total: 20 });
    expect(many).toBeGreaterThan(few); // more evidence → closer to 1.0
    expect(many).toBeLessThan(1);
  });

  it("orders strengths correctly and weakness inverts them", () => {
    const s = inferStrengths({
      weak: { correct: 0, total: 2 },
      strong: { correct: 2, total: 2 },
    });
    expect(s.strong).toBeGreaterThan(s.weak);
    expect(weakness(s.weak)).toBeGreaterThan(weakness(s.strong));
  });
});
