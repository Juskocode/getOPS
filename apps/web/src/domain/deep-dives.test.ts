import { describe, expect, it } from "vitest";

import { branches } from "./branches";
import { deepDiveGuides } from "./deep-dives";
import { branchLearningMeta, learningStages } from "./learning-path";

describe("deep dive curriculum", () => {
  it("covers every branch exactly once in guides and path stages", () => {
    const branchIds = branches.map((branch) => branch.id).sort();
    const guideIds = deepDiveGuides.map((guide) => guide.branchId).sort();
    const pathIds = learningStages.flatMap((stage) => stage.branchIds).sort();

    expect(guideIds).toEqual(branchIds);
    expect(pathIds).toEqual(branchIds);
    expect(new Set(pathIds).size).toBe(branchIds.length);
  });

  it("ships decision-grade depth for each guide", () => {
    for (const guide of deepDiveGuides) {
      expect(guide.objective.length).toBeGreaterThan(40);
      expect(guide.anchor.length).toBeGreaterThan(40);
      expect(guide.signalPath.length).toBeGreaterThanOrEqual(4);
      expect(guide.mentalModels).toHaveLength(3);
      expect(guide.invariants.length).toBeGreaterThanOrEqual(4);
      expect(guide.runbook.length).toBeGreaterThanOrEqual(4);
      expect(guide.failures).toHaveLength(3);
      expect(guide.checkpoints).toHaveLength(3);
      expect(guide.durationMinutes).toBe(branchLearningMeta[guide.branchId].durationMinutes);
      expect(guide.level).toBe(branchLearningMeta[guide.branchId].level);
    }
  });
});
