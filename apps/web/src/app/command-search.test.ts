import { describe, expect, it } from "vitest";

import { searchWorkspaceCommands } from "./command-search";

describe("searchWorkspaceCommands", () => {
  it("shows core destinations before query-specific results", () => {
    const results = searchWorkspaceCommands("", 5);
    expect(results).toHaveLength(5);
    expect(results.every((result) => result.kind === "destination")).toBe(true);
  });

  it("finds an exact pressure scenario and keeps its deep link", () => {
    const [result] = searchWorkspaceCommands("silent connected");
    expect(result).toMatchObject({
      kind: "scenario",
      label: "Silent but connected",
      to: "/simulate?scenario=silent-connected-feed",
    });
  });

  it("searches operational concepts across recall content", () => {
    const results = searchWorkspaceCommands("sequence gap");
    expect(results.some((result) => result.kind === "recall" && result.to.includes("/practice/flashcards"))).toBe(true);
  });

  it("opens the stochastic Galton lab from probability searches", () => {
    const [result] = searchWorkspaceCommands("galton probability");
    expect(result).toMatchObject({
      kind: "destination",
      label: "Galton probability field",
      to: "/lab/galton",
    });
  });
});
