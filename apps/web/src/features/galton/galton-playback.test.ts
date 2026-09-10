import { describe, expect, it } from "vitest";
import { defaultGaltonConfig, simulateGalton } from "./galton-engine";
import { GaltonPlayback, type GaltonSpeed } from "./galton-playback";
import { galtonResultsCsv, parseGaltonSettings } from "./galton-session";

describe("Galton playback", () => {
  it("counts landings, not releases, and does not discard in-flight traces", () => {
    const run = new GaltonPlayback(simulateGalton(defaultGaltonConfig));
    run.advance(20, "slow", false);
    const first = run.particles[0];
    expect(first).toBeDefined();
    expect(run.released).toBe(12);
    expect(run.processed).toBe(0);
    for (let frame = 0; frame < 200; frame++) run.advance(10, "slow", false);
    expect(run.particles).toContain(first);
    expect(run.processed).toBe(0);
    for (let frame = 0; frame < 30; frame++) run.advance(10, "slow", false);
    expect(run.processed).toBeGreaterThan(0);
    expect(run.particles).not.toContain(first);
  });

  it.each([30, 60, 144])("conserves 50k outcomes through speed changes at %s fps", (fps) => {
    const simulation = simulateGalton(defaultGaltonConfig);
    const run = new GaltonPlayback(simulation);
    for (let frame = 0; frame < fps * 30 && !run.complete; frame++) {
      const speed: GaltonSpeed = frame < fps * 2 ? "slow" : frame < fps * 4 ? "normal" : "fast";
      run.advance(1000 / fps, speed, false);
      expect(run.particles.length).toBeLessThanOrEqual(800);
      expect(run.processed).toBeLessThanOrEqual(run.released);
    }
    const expected = new Uint32Array(simulation.config.rows + 1);
    for (const bin of simulation.outcomes) expected[bin] = (expected[bin] ?? 0) + 1;
    expect(run.complete).toBe(true);
    expect(run.bins).toEqual(expected);
    expect(run.particles).toHaveLength(0);
    expect(run.snapshot().processed).toBe(50_000);
  });

  it("keeps reduced-motion accounting identical and ignores invalid deltas", () => {
    const run = new GaltonPlayback(simulateGalton({ ...defaultGaltonConfig, ballCount: 1000 }));
    run.advance(NaN, "fast", true);
    run.advance(-100, "fast", true);
    expect(run.time).toBe(0);
    for (let frame = 0; frame < 100; frame++) run.advance(20, "fast", true);
    expect(run.complete).toBe(true);
    expect(run.particles).toHaveLength(0);
  });
});

describe("Galton saved settings and export", () => {
  it("restores valid values and safely handles malformed or future settings", () => {
    expect(parseGaltonSettings("invalid")).toEqual(defaultGaltonConfig);
    expect(parseGaltonSettings("null")).toEqual(defaultGaltonConfig);
    expect(parseGaltonSettings('{"equation":"unknown","rows":900,"ballCount":"5000","phase":null}'))
      .toEqual({ ...defaultGaltonConfig, rows: 22 });
    expect(parseGaltonSettings(JSON.stringify({ ...defaultGaltonConfig, seed: 42, equation: "constant" })))
      .toEqual({ ...defaultGaltonConfig, seed: 42, equation: "constant" });
  });

  it("exports partial counts and all reproducibility parameters without NaN", () => {
    const simulation = simulateGalton(defaultGaltonConfig);
    const csv = galtonResultsCsv(simulation, new GaltonPlayback(simulation).snapshot());
    expect(csv).toContain("total_settled,total_released,equation,rows,ballCount,seed");
    expect(csv.trim().split("\n")).toHaveLength(18);
    expect(csv).not.toMatch(/NaN|undefined/);
  });
});
