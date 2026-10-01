import type { InfraLabNote, ProgressState } from "@getops/contracts";
import { infrastructureLabById } from "../content/infrastructure/labs";

export const notebookFields = [
  { id: "observations", title: "Verified observations", prompt: "Scope, timestamps and the signals you can actually support." },
  { id: "hypothesis", title: "Hypothesis and uncertainty", prompt: "Likely boundary, alternative explanation and missing evidence." },
  { id: "action", title: "Bounded next action", prompt: "Trading impact, escalation owner, approval and rollback." },
  { id: "recovery", title: "Recovery criteria", prompt: "Correctness, freshness and the observation window." },
] as const;
export type NotebookDraft = Omit<InfraLabNote, "updatedAt">;
export const emptyNotebook: NotebookDraft = { observations: "", hypothesis: "", action: "", recovery: "" };

export function notebookDraft(note?: InfraLabNote): NotebookDraft {
  return Object.fromEntries(notebookFields.map(({ id }) => [id, note?.[id] ?? ""])) as NotebookDraft;
}

export function sameNotebook(left: NotebookDraft, right: NotebookDraft) {
  return notebookFields.every(({ id }) => left[id] === right[id]);
}

export function saveLabNotebook(state: ProgressState, labId: string, draft: NotebookDraft, baseline: InfraLabNote | undefined, now: string): ProgressState {
  const lab = infrastructureLabById.get(labId);
  if (!lab) throw new Error("Unknown investigation.");
  if (notebookFields.some(({ id }) => typeof draft[id] !== "string" || draft[id].length > 1200)) throw new Error("Each notebook field is limited to 1,200 characters.");
  const current = state.infraLabNotes?.[lab.id];
  if (current?.updatedAt !== baseline?.updatedAt || !sameNotebook(notebookDraft(current), notebookDraft(baseline))) {
    throw new Error("This notebook changed in another tab. Your draft is retained. Copy it before loading the saved version.");
  }
  return { ...state, infraLabNotes: { ...state.infraLabNotes, [lab.id]: { ...draft, updatedAt: now } } };
}

export function formatNotebook(title: string, draft: NotebookDraft) {
  return [`${title} | Personal training notes`, "Synthetic exercise; not an operational incident record.",
    ...notebookFields.map(({ id, title: label }) => `\n${label}\n${draft[id].trim() || "Not recorded"}`)].join("\n");
}
