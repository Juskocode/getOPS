import { describe, expect, it } from "vitest";

import { scenarioBriefings } from "./scenario-briefings";

describe("scenario briefings", () => {
  it("ships unique, decision-grade pressure entries", () => {
    expect(scenarioBriefings.length).toBeGreaterThanOrEqual(6);
    expect(new Set(scenarioBriefings.map((scenario) => scenario.id)).size).toBe(
      scenarioBriefings.length,
    );
    for (const scenario of scenarioBriefings) {
      expect(scenario.signals.length).toBeGreaterThanOrEqual(4);
      expect(scenario.openingMove.length).toBeGreaterThan(60);
      expect(scenario.controlBoundary.length).toBeGreaterThan(60);
      expect(scenario.signals.some((signal) => signal.tone === "critical")).toBe(true);
    }
  });
});
