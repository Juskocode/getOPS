import type { ProgressState } from "@getops/contracts";
import { infrastructureLabById, infrastructureLabs, type InfrastructureLab } from "../content/infrastructure/labs";
import { checkpointResult } from "./infrastructure";

export function labProgress(lab: InfrastructureLab, state: ProgressState) {
  const run = state.infraLabs?.[lab.id];
  const results = lab.steps.map((step, index) => checkpointResult(step, run?.decisions[index]?.choices));
  const completed = results.filter((result) => result.complete).length;
  return { completed, total: lab.steps.length, done: completed === lab.steps.length,
    independent: results.filter((result) => result.independent).length,
    guided: results.filter((result) => result.correct && !result.independent).length,
    revealed: results.filter((result) => result.complete && !result.correct).length,
    next: Math.max(0, results.findIndex((result) => !result.complete)),
    inspected: run?.inspected ?? [], results };
}

export function inspectLabEvidence(state: ProgressState, labId: string, evidence: number, now: string): ProgressState {
  const lab = infrastructureLabById.get(labId);
  if (!lab || !Number.isInteger(evidence) || !lab.evidence[evidence]) return state;
  const run = state.infraLabs?.[lab.id] ?? { inspected: [], decisions: [], updatedAt: now };
  if (run.inspected.includes(evidence)) return state;
  return { ...state, infraLabs: { ...state.infraLabs, [lab.id]: { ...run, inspected: [...run.inspected, evidence], updatedAt: now } } };
}

export function recordLabChoice(state: ProgressState, labId: string, index: number, choice: number, now: string): ProgressState {
  const lab = infrastructureLabById.get(labId);
  if (!lab || !Number.isInteger(index) || !Number.isInteger(choice) || choice < 0 || choice > 3) return state;
  const step = lab.steps[index];
  const run = state.infraLabs?.[lab.id];
  if (!step || !run || !step.requires.every((id) => run.inspected.includes(id))) return state;
  if (lab.steps.slice(0, index).some((previous, n) => !checkpointResult(previous, run.decisions[n]?.choices).complete)) return state;
  const previous = run.decisions[index]?.choices ?? [];
  if (checkpointResult(step, previous).complete || previous.includes(choice)) return state;
  const choices = [...previous, choice];
  const decisions = [...run.decisions];
  decisions[index] = { choices, updatedAt: now };
  return { ...state, xp: Math.min(100_000_000, (state.xp ?? 0) + checkpointResult(step, choices).xp),
    infraLabs: { ...state.infraLabs, [lab.id]: { ...run, decisions, updatedAt: now } } };
}

export function infrastructureLabProgress(state: ProgressState) {
  const runs = infrastructureLabs.map((lab) => labProgress(lab, state));
  return { completed: runs.filter((run) => run.done).length,
    decisions: runs.reduce((sum, run) => sum + run.completed, 0),
    independent: runs.reduce((sum, run) => sum + run.independent, 0),
    next: infrastructureLabs.find((_, index) => !runs[index]!.done) ?? infrastructureLabs[0]! };
}

export function dailyLabReviews(state: ProgressState, date: Date) {
  const day = date.toLocaleDateString("en-CA");
  return infrastructureLabs.reduce((sum, lab) => sum + lab.steps.filter((step, index) => {
    const decision = state.infraLabs?.[lab.id]?.decisions[index];
    return decision && checkpointResult(step, decision.choices).complete && new Date(decision.updatedAt).toLocaleDateString("en-CA") === day;
  }).length, 0);
}
