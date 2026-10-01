import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { infrastructureLabs } from "../../content/infrastructure/labs";
import { LabDecision } from "./LabDecision";

const step = infrastructureLabs[0]!.steps[0]!;
afterEach(cleanup);

function Harness({ next, fail = false, allowed = true }: { next: () => void; fail?: boolean; allowed?: boolean }) {
  const [choices, setChoices] = useState<number[]>([]);
  const [error, setError] = useState("");
  return <LabDecision step={step} choices={choices} allowed={allowed} pending={false} error={error} rehearsal={false} last={false} onNext={next}
    onSubmit={async (choice) => {
      if (fail) { setError("Save failed"); return false; }
      setError(""); setChoices((previous) => [...previous, choice]); return true;
    }} />;
}

function answer(index: number) { return screen.getByRole("button", { name: new RegExp(step.options[index]!.label.slice(0, 25)) }); }

describe("LabDecision", () => {
  it("requires inspected evidence before a decision", () => {
    render(<Harness next={vi.fn()} allowed={false} />);
    expect(answer(0)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Commit decision" })).toBeDisabled();
    expect(screen.queryByText(step.takeaway)).not.toBeInTheDocument();
  });

  it("keeps incorrect choices hidden from the guide and waits for explicit next", async () => {
    const next = vi.fn();
    render(<Harness next={next} />);
    fireEvent.click(answer(0));
    fireEvent.click(screen.getByRole("button", { name: "Commit decision" }));
    await screen.findByText("Reconsider this decision.");
    await waitFor(() => expect(answer(0)).toHaveAttribute("aria-pressed", "false"));
    expect(answer(0)).toBeDisabled();
    expect(screen.queryByText(step.takeaway)).not.toBeInTheDocument();
    fireEvent.click(answer(step.answer));
    fireEvent.click(screen.getByRole("button", { name: "Commit decision" }));
    await screen.findByText(step.takeaway);
    expect(screen.getByText("CORRECT / GUIDED / +5 XP")).toBeInTheDocument();
    expect(next).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next decision" }));
    expect(next).toHaveBeenCalledOnce();
  });

  it("retains selection after failure and completes on explicit retry", async () => {
    const next = vi.fn();
    const { rerender } = render(<Harness next={next} fail />);
    fireEvent.click(answer(step.answer));
    fireEvent.click(screen.getByRole("button", { name: "Commit decision" }));
    await screen.findByRole("alert");
    expect(answer(step.answer)).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(step.takeaway)).not.toBeInTheDocument();
    rerender(<Harness next={next} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry decision" }));
    await screen.findByText("CORRECT / FIRST TRY / +15 XP");
    expect(next).not.toHaveBeenCalled();
  });

  it("reveals the final option after three wrong choices without correctness credit", () => {
    render(<LabDecision step={step} choices={[0, 2, 3]} allowed pending={false} error="" rehearsal={false} last onNext={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByText("ANSWER REVIEW")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View debrief" })).toBeInTheDocument();
    expect(screen.queryByText(/\+15 XP/)).not.toBeInTheDocument();
  });
});
