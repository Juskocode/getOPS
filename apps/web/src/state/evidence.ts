import type { FlashAttempt, ProgressState } from "@getops/contracts";

import { flashcardsById } from "../content/catalog";
import { branches } from "../domain/branches";

export function latestAttempts(state: ProgressState): Map<string, FlashAttempt> {
  const latest = new Map<string, FlashAttempt>();
  for (const attempt of state.flashAttempts ?? []) {
    const current = latest.get(attempt.cardId);
    if (!current || current.createdAt < attempt.createdAt) latest.set(attempt.cardId, attempt);
  }
  return latest;
}

export function recallReward(score: number): number {
  if (score >= 80) return 10;
  if (score >= 60) return 5;
  return 0;
}

export function recallSummary(state: ProgressState) {
  const latest = latestAttempts(state);
  const attempts = [...latest.values()];
  const strong = attempts.filter((attempt) => attempt.score >= 80).length;
  const average = attempts.length
    ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length)
    : 0;
  return {
    validated: attempts.length,
    strong,
    average,
    branches: branches.map((branch) => {
      const branchAttempts = attempts.filter(
        (attempt) => flashcardsById.get(attempt.cardId)?.branch === branch.id,
      );
      return {
        ...branch,
        attempts: branchAttempts,
      };
    }),
  };
}
