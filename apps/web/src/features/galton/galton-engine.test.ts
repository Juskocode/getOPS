import { describe, expect, it } from "vitest";

import {
  defaultGaltonConfig,
  evaluateRightProbability,
  expectedDistribution,
  simulateGalton,
  summarizeDistribution,
} from "./galton-engine";

describe("Galton simulation engine", () => {
  it("builds a normalized fair distribution", () => {
    const config = { ...defaultGaltonConfig, equation: "constant" as const, rows: 16 };
    const expected = expectedDistribution(config);
    const total = Array.from(expected).reduce((sum, value) => sum + value, 0);
    const summary = summarizeDistribution(expected);
    expect(total).toBeCloseTo(1, 12);
    expect(summary.mean).toBeCloseTo(8, 10);
    expect(summary.sigma).toBeCloseTo(2, 10);
  });

  it("keeps every configurable field inside a valid probability boundary", () => {
    const extreme = {
      ...defaultGaltonConfig,
      equation: "linear" as const,
      baseProbability: 0.9,
      spatialDrift: 0.35,
      rowDrift: 0.3,
    };
    expect(evaluateRightProbability(extreme, 15, 15)).toBe(0.98);
    expect(
      evaluateRightProbability({ ...extreme, baseProbability: 0.1, rowDrift: -0.3 }, 15, 0),
    ).toBe(0.02);
  });

  it("simulates all 50,000 deterministic outcomes and path decisions", () => {
    const first = simulateGalton(defaultGaltonConfig);
    const second = simulateGalton(defaultGaltonConfig);
    expect(first.outcomes).toHaveLength(50_000);
    expect(first.paths).toHaveLength(50_000);
    expect(Array.from(first.outcomes.slice(0, 100))).toEqual(Array.from(second.outcomes.slice(0, 100)));
    expect(Array.from(first.paths.slice(0, 100))).toEqual(Array.from(second.paths.slice(0, 100)));
    expect(first.outcomes.every((bin) => bin <= defaultGaltonConfig.rows)).toBe(true);
  });
});
