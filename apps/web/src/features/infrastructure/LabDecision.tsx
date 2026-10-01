import { ArrowRight, Check, CircleAlert, LockKeyhole } from "lucide-react";
import { useState } from "react";
import type { InfrastructureLab } from "../../content/infrastructure/labs";
import { checkpointResult } from "../../domain/infrastructure";

export function LabDecision({ step, choices, allowed, pending, error, rehearsal, onSubmit, onNext, last }: {
  step: InfrastructureLab["steps"][number]; choices: number[]; allowed: boolean; pending: boolean;
  error: string; rehearsal: boolean; onSubmit: (choice: number) => Promise<boolean>; onNext: () => void; last: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const result = checkpointResult(step, choices);
  const lastChoice = choices.at(-1);
  return <section className="infra-checkpoint investigation-decision" aria-label="Investigation decision">
    <header><span className="eyebrow">{step.phase.toUpperCase()} / DECISION</span><span>{rehearsal ? "Rehearsal / no additional XP" : "15 XP first try / 5 XP guided"}</span></header>
    <h2>{step.prompt}</h2>
    {!allowed && !result.complete && <p className="investigation-locked"><LockKeyhole size={16} />Inspect the highlighted evidence before committing a decision.</p>}
    <div className="infra-answer-options" role="group" aria-label="Decision options">
      {step.options.map((option, index) => <button key={index} type="button" aria-pressed={selected === index}
        disabled={!allowed || pending || result.complete || choices.includes(index)}
        data-outcome={result.complete && index === step.answer ? "correct" : choices.includes(index) ? "incorrect" : undefined}
        onClick={() => setSelected(index)}><span className="infra-answer-letter">{result.complete && index === step.answer ? <Check size={16} /> : String.fromCharCode(65 + index)}</span><span>{option.label}</span></button>)}
    </div>
    {error && <p className="infra-save-error" role="alert">{error}</p>}
    {!result.complete && lastChoice !== undefined && <div className="infra-feedback" role="status"><CircleAlert size={18} /><div><strong>Reconsider this decision.</strong><p>{step.options[lastChoice]?.reason}</p></div></div>}
    {!result.complete && <button type="button" className="button button-primary" disabled={!allowed || selected === null || pending} onClick={() => {
      if (selected !== null) void onSubmit(selected).then((saved) => { if (saved) setSelected(null); });
    }}><Check size={16} />{pending ? "Saving..." : error ? "Retry decision" : "Commit decision"}</button>}
    {result.complete && <div className="infra-answer-guide" aria-live="polite">
      <span className="eyebrow">{result.independent ? "CORRECT / FIRST TRY" : result.correct ? "CORRECT / GUIDED" : "ANSWER REVIEW"}{!rehearsal && result.xp ? ` / +${result.xp} XP` : ""}</span>
      <h3>{step.takeaway}</h3><p>{step.options[step.answer]?.reason}</p>
      <details><summary>Compare all decisions</summary>{step.options.map((option, index) => <div key={index}><strong>{String.fromCharCode(65 + index)}. {option.label}</strong><p>{option.reason}</p></div>)}</details>
      <footer><span>{rehearsal ? "Original evidence remains unchanged" : "Decision saved"}</span><button type="button" className="button button-primary" onClick={onNext}>{last ? "View debrief" : "Next decision"}<ArrowRight size={16} /></button></footer>
    </div>}
  </section>;
}
