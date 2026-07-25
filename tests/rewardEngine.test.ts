import { describe, it, expect } from "vitest";
import {
  baseReward,
  computeReward,
  hitProbability,
  hiMultiplier,
  M_LO,
} from "../src/lib/rewardEngine";

/** Deterministic seeded RNG (mulberry32) so tests are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stats(xs: number[]) {
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
  return { mean, variance };
}

describe("rewardEngine", () => {
  it("Dial 1: weak topics pay more than strong (anti-comfort-zone)", () => {
    expect(baseReward(0.1)).toBeGreaterThan(baseReward(0.9));
    expect(baseReward(0.0)).toBe(50);
    expect(baseReward(1.0)).toBe(10);
  });

  it("fixed condition is deterministic and always pays base", () => {
    for (const s of [0.1, 0.5, 0.9]) {
      const draws = Array.from({ length: 100 }, () =>
        computeReward(s, "fixed", mulberry32(1)).awarded,
      );
      const unique = new Set(draws);
      expect(unique.size).toBe(1);
      expect([...unique][0]).toBe(baseReward(s));
    }
  });

  it("variable condition: E[multiplier] ~= 1 across the strength range", () => {
    const rng = mulberry32(42);
    for (const s of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const N = 20000;
      const mults = Array.from({ length: N }, () => computeReward(s, "variable", rng).multiplier);
      const { mean } = stats(mults);
      expect(mean).toBeCloseTo(1, 1); // within ~0.05
    }
  });

  it("variable condition has strictly greater variance than fixed at matched strength", () => {
    const rng = mulberry32(7);
    for (const s of [0.1, 0.5, 0.9]) {
      const N = 20000;
      const variable = Array.from({ length: N }, () => computeReward(s, "variable", rng).awarded);
      const fixed = Array.from({ length: N }, () => computeReward(s, "fixed", rng).awarded);
      expect(stats(variable).variance).toBeGreaterThan(stats(fixed).variance);
      expect(stats(fixed).variance).toBe(0);
    }
  });

  it("variable and fixed share the same expected value (isolation holds)", () => {
    // The DESIGN gives E[awarded] === base (E[multiplier] === 1, proven below).
    // Integer rounding of round(base * multiplier) introduces a small upward
    // bias (< ~1 pt), so we assert |mean - base| stays within that rounding band
    // rather than demanding exact equality.
    const rng = mulberry32(99);
    for (const s of [0.2, 0.5, 0.8]) {
      const N = 20000;
      const variable = Array.from({ length: N }, () => computeReward(s, "variable", rng).awarded);
      expect(Math.abs(stats(variable).mean - baseReward(s))).toBeLessThan(1.5);
    }
  });

  it("hiMultiplier makes E[m]=1 analytically", () => {
    for (const s of [0.1, 0.5, 0.9]) {
      const p = hitProbability(s);
      const expected = p * hiMultiplier(p) + (1 - p) * M_LO;
      expect(expected).toBeCloseTo(1, 10);
    }
  });
});
