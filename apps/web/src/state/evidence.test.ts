import { describe, expect, it } from "vitest";

import { recallReward } from "./evidence";

describe("recallReward", () => {
  it("awards bounded evidence XP by rubric tier", () => {
    expect(recallReward(59)).toBe(0);
    expect(recallReward(60)).toBe(5);
    expect(recallReward(79)).toBe(5);
    expect(recallReward(80)).toBe(10);
    expect(recallReward(100)).toBe(10);
  });
});
