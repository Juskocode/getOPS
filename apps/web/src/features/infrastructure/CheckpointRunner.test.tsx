import type { ProgressState } from "@getops/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { infraQuestions } from "../../content/infrastructure/catalog";
import { CheckpointRunner } from "./CheckpointRunner";

let failSave = false;
vi.mock("../../state/profile-state", () => ({
  useProfileState: () => {
    const [state, setState] = useState<ProgressState>({});
    return { state, save: async (update: (state: ProgressState) => ProgressState) => {
      if (failSave) throw new Error("offline");
      setState(update);
    } };
  },
}));
afterEach(() => { cleanup(); failSave = false; });

describe("CheckpointRunner", () => {
  it("waits for explicit next, allows wrong choices, and exposes explanation only at completion", async () => {
    const next = vi.fn();
    const q = infraQuestions[0]!;
    render(<MemoryRouter><CheckpointRunner question={q} position={1} total={4} onNext={next} /></MemoryRouter>);
    expect(screen.queryByText(q.takeaway)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(q.options[0]!.label.slice(0, 20)) }));
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    await screen.findByText("Not this one. Try another.");
    expect(screen.queryByText(q.takeaway)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(q.options[1]!.label.slice(0, 20)) }));
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    await screen.findByText(q.takeaway);
    expect(next).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next checkpoint" }));
    expect(next).toHaveBeenCalledOnce();
  });
  it("keeps the selected answer recoverable when saving fails", async () => {
    failSave = true;
    const q = infraQuestions[0]!;
    render(<MemoryRouter><CheckpointRunner question={q} position={1} total={4} /></MemoryRouter>);
    const answer = screen.getByRole("button", { name: new RegExp(q.options[1]!.label.slice(0, 20)) });
    fireEvent.click(answer);
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    await screen.findByRole("alert");
    expect(answer).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(q.takeaway)).not.toBeInTheDocument();
    failSave = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
    await screen.findByText(q.takeaway);
  });
});
