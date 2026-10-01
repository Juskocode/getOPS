import { progressStateSchema, type ProgressState } from "@getops/contracts";
import { describe, expect, it } from "vitest";
import { infrastructureLabs } from "../content/infrastructure/labs";
import { infraLessonById } from "../content/infrastructure/catalog";
import { dailyLabReviews, infrastructureLabProgress, inspectLabEvidence, labProgress, recordLabChoice } from "./infrastructure-labs";

const now = "2026-10-01T12:00:00Z";
const lab = infrastructureLabs[0]!;
const inspectAll = (state: ProgressState = {}) => lab.evidence.reduce((next, _, index) => inspectLabEvidence(next, lab.id, index, now), state);

describe("infrastructure investigations", () => {
  it("has linked lessons, twelve complete decisions and synthetic evidence", () => {
    expect(infrastructureLabs).toHaveLength(4);
    expect(new Set(infrastructureLabs.map((item) => item.id)).size).toBe(4);
    for (const item of infrastructureLabs) {
      expect(item.steps).toHaveLength(3);
      expect(item.evidence).toHaveLength(4);
      expect(item.trace).toHaveLength(12);
      expect(new URL(item.source.url).protocol).toBe("https:");
      for (const id of item.lessons) expect(infraLessonById.has(id)).toBe(true);
      for (const step of item.steps) {
        expect(step.options).toHaveLength(4);
        expect(step.options[step.answer]).toBeDefined();
        expect(step.requires.length).toBeGreaterThan(0);
        for (const id of step.requires) expect(item.evidence[id]).toBeDefined();
        for (const option of step.options) expect(option.reason.length).toBeGreaterThan(50);
      }
    }
  });
  it("requires inspected evidence and sequential decisions", () => {
    expect(recordLabChoice({}, lab.id, 0, 1, now)).toEqual({});
    const state = inspectAll();
    expect(recordLabChoice(state, lab.id, 1, 2, now)).toBe(state);
    expect(labProgress(lab, state).completed).toBe(0);
  });
  it("retains wrong guesses, awards only once and survives duplicate retries", () => {
    const start = inspectAll({ xp: 10 });
    const wrong = recordLabChoice(start, lab.id, 0, 0, now);
    expect(wrong.xp).toBe(10);
    expect(labProgress(lab, wrong).completed).toBe(0);
    expect(recordLabChoice(wrong, lab.id, 0, 0, now)).toBe(wrong);
    const correct = recordLabChoice(wrong, lab.id, 0, 1, now);
    expect(correct.xp).toBe(15);
    expect(recordLabChoice(correct, lab.id, 0, 2, now)).toBe(correct);
    expect(labProgress(lab, correct)).toMatchObject({ completed: 1, guided: 1, independent: 0, next: 1 });
    expect(progressStateSchema.parse(correct)).toEqual(correct);
  });
  it("reveals after three wrong options without correctness XP", () => {
    let state = inspectAll();
    for (const choice of [0, 2, 3]) state = recordLabChoice(state, lab.id, 0, choice, now);
    expect(labProgress(lab, state)).toMatchObject({ completed: 1, revealed: 1, independent: 0 });
    expect(state.xp).toBe(0);
    expect(dailyLabReviews(state, new Date(now))).toBe(1);
  });
  it("preserves completion and counts only today's completed decisions", () => {
    let state = inspectAll();
    for (const [index, step] of lab.steps.entries()) state = recordLabChoice(state, lab.id, index, step.answer, now);
    expect(state.xp).toBe(45);
    expect(labProgress(lab, state)).toMatchObject({ done: true, independent: 3 });
    expect(infrastructureLabProgress(state)).toMatchObject({ completed: 1, decisions: 3 });
    expect(dailyLabReviews(state, new Date(now))).toBe(3);
    expect(dailyLabReviews(state, new Date("2026-10-02T12:00:00Z"))).toBe(0);
    expect(inspectLabEvidence(state, lab.id, 0, now)).toBe(state);
  });
  it("ignores invalid inputs without creating progress", () => {
    const state = inspectAll();
    for (const value of [-1, 4, 1.5, NaN]) {
      expect(inspectLabEvidence(state, lab.id, value, now)).toBe(state);
      expect(recordLabChoice(state, lab.id, 0, value, now)).toBe(state);
    }
    expect(recordLabChoice(state, "missing", 0, 0, now)).toBe(state);
    expect(recordLabChoice(state, lab.id, 3, 0, now)).toBe(state);
  });
  it("rejects malformed persisted lab evidence", () => {
    const valid = { inspected: [0], decisions: [{ choices: [1], updatedAt: now }], updatedAt: now };
    expect(progressStateSchema.safeParse({ infraLabs: { [lab.id]: valid } }).success).toBe(true);
    for (const patch of [{ inspected: [0, 0] }, { inspected: [4] }, { updatedAt: "yesterday" }, { decisions: Array(4).fill(valid.decisions[0]) }, { decisions: [{ choices: [1, 1], updatedAt: now }] }]) {
      expect(progressStateSchema.safeParse({ infraLabs: { [lab.id]: { ...valid, ...patch } } }).success).toBe(false);
    }
    expect(progressStateSchema.safeParse({ infraLabs: { unknown: valid } }).success).toBe(false);
  });
});
