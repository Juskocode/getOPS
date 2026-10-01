import type { ProgressState } from "@getops/contracts";

import { infraQuestionById, infraQuestions, infrastructureLessons } from "../content/infrastructure/catalog";
import type { InfraQuestion } from "../content/infrastructure/types";

export function checkpointResult(question: InfraQuestion, choices: number[] = []) {
  const correct = choices.includes(question.answer);
  const complete = correct || choices.length >= question.options.length - 1;
  const independent = correct && choices.length === 1;
  return { correct, complete, independent, xp: correct ? independent ? 15 : 5 : 0 };
}

// Re-evaluate against the latest revision so double-clicks and save retries cannot farm XP.
export function recordInfraChoice(state: ProgressState, questionId: string, choice: number, now: string): ProgressState {
  const question = infraQuestionById.get(questionId);
  if (!question || !Number.isInteger(choice) || choice < 0 || choice >= question.options.length) return state;
  const previous = state.infraAnswers?.[questionId]?.choices ?? [];
  if (checkpointResult(question, previous).complete || previous.includes(choice)) return state;
  const choices = [...previous, choice];
  const result = checkpointResult(question, choices);
  return {
    ...state,
    xp: Math.min(100_000_000, (state.xp ?? 0) + result.xp),
    infraAnswers: { ...state.infraAnswers, [questionId]: { choices, updatedAt: now } },
  };
}

export function infrastructureProgress(state: ProgressState) {
  const results = infraQuestions.map((question) => checkpointResult(question, state.infraAnswers?.[question.id]?.choices));
  const completed = results.filter((result) => result.complete).length;
  return {
    total: results.length,
    completed,
    independent: results.filter((result) => result.independent).length,
    assisted: results.filter((result) => result.correct && !result.independent).length,
    revealed: results.filter((result) => result.complete && !result.correct).length,
    read: state.infraRead?.length ?? 0,
    percent: Math.round(completed / results.length * 100),
    next: infrastructureLessons.find((lesson) => !state.infraRead?.includes(lesson.id) || lesson.questions.some(
      (question) => !checkpointResult(question, state.infraAnswers?.[question.id]?.choices).complete,
    )) ?? infrastructureLessons[0]!,
  };
}
