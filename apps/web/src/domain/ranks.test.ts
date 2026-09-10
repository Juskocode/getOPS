import { describe, expect, it } from "vitest";

import { operatorRanks, rankProgress } from "./ranks";

describe("rankProgress", () => {
  it("maps XP into bounded operator ranks", () => {
    expect(rankProgress(0)).toMatchObject({ rankNumber: 1, progress: 0, xpToNext: 100 });
    expect(rankProgress(175)).toMatchObject({ rankNumber: 2, progress: 50, xpToNext: 75 });
    expect(rankProgress(99_000)).toMatchObject({
      rankNumber: operatorRanks.length,
      progress: 100,
      xpToNext: 0,
      next: null,
    });
  });

  it("normalizes negative and fractional XP", () => {
    expect(rankProgress(-10).xp).toBe(0);
    expect(rankProgress(250.9).current.name).toBe("Book Mapper");
  });
});
