import { describe, expect, it } from "vitest";

import { flashcardCatalog, flashcards } from "./catalog";

describe("flashcard catalog", () => {
  it("loads the complete versioned curriculum", () => {
    expect(flashcardCatalog.schemaVersion).toBe(1);
    expect(flashcards).toHaveLength(150);
    expect(new Set(flashcards.map((card) => card.id)).size).toBe(150);
  });

  it("keeps every training branch represented", () => {
    const branchCounts = new Map<string, number>();
    for (const card of flashcards) {
      branchCounts.set(card.branch, (branchCounts.get(card.branch) ?? 0) + 1);
    }

    expect([...branchCounts.keys()].sort()).toEqual([
      "capacity",
      "feed",
      "incident",
      "interview",
      "market",
      "monitoring",
      "orders",
      "risk",
      "sessions",
    ]);
    expect(Math.min(...branchCounts.values())).toBeGreaterThanOrEqual(8);
  });

  it("ships distinct prompts with operational guidance", () => {
    expect(new Set(flashcards.map((card) => card.prompt)).size).toBe(150);
    for (const card of flashcards) {
      expect(card.answer.length).toBeGreaterThan(20);
      expect(card.deepDive.length).toBeGreaterThan(20);
    }
  });
});
