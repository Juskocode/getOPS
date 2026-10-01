import { progressStateSchema, type ProgressState } from "@getops/contracts";
import { describe, expect, it } from "vitest";

import { infraLessonById, infraQuestions, infrastructureLessons } from "../content/infrastructure/catalog";
import { packetCases, packetStages } from "../content/infrastructure/packet-path";
import { checkpointResult, dailyInfrastructureReviews, infrastructureProgress, recordInfraChoice } from "./infrastructure";

const now = "2026-10-01T12:00:00.000Z";
const question = infraQuestions[0]!;

describe("infrastructure curriculum", () => {
  it("has a valid ordered path, unique questions and complete explanations", () => {
    expect(infrastructureLessons).toHaveLength(8);
    expect(infraQuestions).toHaveLength(32);
    expect(new Set(infraQuestions.map((q) => q.id)).size).toBe(32);
    const preceding = new Set<string>();
    for (const lesson of infrastructureLessons) {
      if (lesson.prerequisite) expect(preceding.has(lesson.prerequisite)).toBe(true);
      preceding.add(lesson.id);
      expect(lesson.concepts).toHaveLength(3);
      expect(lesson.commands).toHaveLength(2);
      expect(lesson.sources.length).toBeGreaterThanOrEqual(2);
      for (const source of lesson.sources) expect(new URL(source.url).protocol).toBe("https:");
      for (const q of lesson.questions) {
        expect(q.options).toHaveLength(4);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(4);
        expect(new Set(q.options.map((option) => option.label)).size).toBe(4);
        for (const option of q.options) expect(option.reason.length).toBeGreaterThan(35);
      }
    }
  });
  it("maps every diagnostic boundary to a real lesson", () => {
    for (const stage of packetStages) expect(infraLessonById.has(stage.lesson)).toBe(true);
    for (const scenario of packetCases) {
      expect(scenario.delays).toHaveLength(packetStages.length);
      expect(scenario.delays.every((delay) => delay > 0)).toBe(true);
    }
  });
});

describe("checkpoint evidence", () => {
  it("counts completed infrastructure reviews on their local calendar day only", () => {
    const pending = recordInfraChoice({}, question.id, 0, now);
    expect(dailyInfrastructureReviews(pending, new Date(now))).toBe(0);
    const completed = recordInfraChoice(pending, question.id, question.answer, now);
    expect(dailyInfrastructureReviews(completed, new Date(now))).toBe(1);
    expect(dailyInfrastructureReviews(completed, new Date("2026-10-02T12:00:00.000Z"))).toBe(0);
    expect(dailyInfrastructureReviews({}, new Date(now))).toBe(0);
  });
  it("counts revealed reviews as practice without implying correct answers", () => {
    let state: ProgressState = {};
    for (const wrong of [0, 2, 3]) state = recordInfraChoice(state, question.id, wrong, now);
    expect(dailyInfrastructureReviews(state, new Date(now))).toBe(1);
    expect(state.xp).toBe(0);
    expect(infrastructureProgress(state).independent).toBe(0);
  });
  it("retains wrong choices without revealing the answer early", () => {
    const state = recordInfraChoice({}, question.id, 0, now);
    expect(state.xp).toBe(0);
    expect(checkpointResult(question, state.infraAnswers?.[question.id]?.choices).complete).toBe(false);
    expect(recordInfraChoice(state, question.id, 0, now)).toBe(state);
  });
  it("awards once and ignores late/double submissions after a correct answer", () => {
    const state = recordInfraChoice({ xp: 100 }, question.id, question.answer, now);
    expect(state.xp).toBe(115);
    expect(recordInfraChoice(state, question.id, question.answer, now)).toBe(state);
    expect(recordInfraChoice(state, question.id, 0, now)).toBe(state);
    expect(progressStateSchema.parse(state)).toEqual(state);
  });
  it("gives guided credit without converting it into first-try evidence", () => {
    const wrong = recordInfraChoice({}, question.id, 0, now);
    const correct = recordInfraChoice(wrong, question.id, question.answer, now);
    expect(correct.xp).toBe(5);
    expect(infrastructureProgress(correct)).toMatchObject({ completed: 1, independent: 0, assisted: 1 });
  });
  it("reveals after three distinct wrong answers without giving correctness XP", () => {
    let state: ProgressState = {};
    for (const wrong of [0, 2, 3]) state = recordInfraChoice(state, question.id, wrong, now);
    expect(checkpointResult(question, state.infraAnswers?.[question.id]?.choices)).toMatchObject({ complete: true, correct: false, xp: 0 });
    expect(recordInfraChoice(state, question.id, question.answer, now)).toBe(state);
    expect(infrastructureProgress(state).revealed).toBe(1);
  });
  it("rejects unknown IDs and invalid input without modifying state", () => {
    const state = { xp: 42 };
    for (const choice of [-1, 4, 1.5, NaN]) expect(recordInfraChoice(state, question.id, choice, now)).toBe(state);
    expect(recordInfraChoice(state, "nic-999", 0, now)).toBe(state);
  });
  it("enforces unique IDs, bounded choices and timestamps in the shared contract", () => {
    expect(progressStateSchema.safeParse({ infraRead: ["nic", "nic"] }).success).toBe(false);
    expect(progressStateSchema.safeParse({ infraRead: ["unknown"] }).success).toBe(false);
    for (const choices of [[0, 0], [4], [], [0, 1, 2, 3]]) {
      expect(progressStateSchema.safeParse({ infraAnswers: { "nic-1": { choices, updatedAt: now } } }).success).toBe(false);
    }
  });
});
