import { progressStateSchema } from "@getops/contracts";
import { describe, expect, it } from "vitest";
import { emptyNotebook, formatNotebook, notebookDraft, sameNotebook, saveLabNotebook } from "./infrastructure-notes";

const now = "2026-10-01T12:00:00Z";
const draft = { ...emptyNotebook, observations: "A rising local queue, not a proven venue outage." };
describe("investigation notebook", () => {
  it("saves bounded notes without changing scores or decision evidence", () => {
    const state = saveLabNotebook({ xp: 45 }, "rx-hotspot", draft, undefined, now);
    expect(state.xp).toBe(45);
    expect(state.infraLabs).toBeUndefined();
    expect(notebookDraft(state.infraLabNotes?.["rx-hotspot"])).toEqual(draft);
    expect(progressStateSchema.parse(state)).toEqual(state);
    expect(sameNotebook(draft, notebookDraft(state.infraLabNotes?.["rx-hotspot"]))).toBe(true);
  });
  it("rejects concurrent edits rather than overwriting another tab", () => {
    const state = saveLabNotebook({}, "rx-hotspot", draft, undefined, now);
    expect(() => saveLabNotebook(state, "rx-hotspot", emptyNotebook, undefined, now)).toThrow("another tab");
    const baseline = state.infraLabNotes?.["rx-hotspot"];
    const updated = saveLabNotebook(state, "rx-hotspot", { ...draft, action: "Engage incident lead." }, baseline, now);
    // Content comparison also protects writes with an identical millisecond timestamp.
    expect(() => saveLabNotebook(updated, "rx-hotspot", emptyNotebook, baseline, now)).toThrow("another tab");
  });
  it("preserves unrelated notes and rejects invalid IDs or long text", () => {
    const state = saveLabNotebook({}, "fd-exhaustion", draft, undefined, now);
    const next = saveLabNotebook(state, "lock-convoy", draft, undefined, now);
    expect(next.infraLabNotes?.["fd-exhaustion"]).toEqual(state.infraLabNotes?.["fd-exhaustion"]);
    expect(() => saveLabNotebook(state, "unknown", draft, undefined, now)).toThrow();
    expect(() => saveLabNotebook({}, "rx-hotspot", { ...draft, action: "a".repeat(1201) }, undefined, now)).toThrow();
    expect(progressStateSchema.safeParse({ infraLabNotes: { unknown: { ...draft, updatedAt: now } } }).success).toBe(false);
    expect(progressStateSchema.safeParse({ infraLabNotes: { "rx-hotspot": { ...draft, action: "a".repeat(1201), updatedAt: now } } }).success).toBe(false);
  });
  it("exports plain text with a clear self-study boundary", () => {
    const text = formatNotebook("Case title", draft);
    expect(text).toContain("Synthetic exercise; not an operational incident record.");
    expect(text).toContain("Verified observations\nA rising local queue");
    expect(text).toContain("Recovery criteria\nNot recorded");
  });
  it("accepts Unicode notes using browser character limits", () => {
    const state = saveLabNotebook({}, "rx-hotspot", { ...draft, observations: "\u00e1".repeat(1200) }, undefined, now);
    expect(progressStateSchema.safeParse(state).success).toBe(true);
    expect(() => saveLabNotebook({}, "rx-hotspot", { ...draft, observations: "\u00e1".repeat(1201) }, undefined, now)).toThrow();
  });
});
