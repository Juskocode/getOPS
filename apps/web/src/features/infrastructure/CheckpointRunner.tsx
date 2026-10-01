import { ArrowRight, Check, CircleAlert, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router";

import type { InfraQuestion } from "../../content/infrastructure/types";
import { checkpointResult, recordInfraChoice } from "../../domain/infrastructure";
import { useProfileState } from "../../state/profile-state";

export function CheckpointRunner({ question, position, total, onNext, nextLesson }: {
  question: InfraQuestion; position: number; total: number; onNext?: (() => void) | undefined; nextLesson?: string | undefined;
}) {
  const { state, save } = useProfileState();
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [rehearsal, setRehearsal] = useState<number[] | null>(null);
  const submitting = useRef(false);
  const choices = rehearsal ?? state.infraAnswers?.[question.id]?.choices ?? [];
  const result = checkpointResult(question, choices);
  const lastChoice = choices.at(-1);

  async function submit() {
    if (selected === null || submitting.current || result.complete) return;
    submitting.current = true; setPending(true); setError("");
    try {
      if (rehearsal) setRehearsal([...rehearsal, selected]);
      else await save((current) => recordInfraChoice(current, question.id, selected, new Date().toISOString()));
      setSelected(null);
    } catch {
      setError("Your selection is still here. Progress was not saved; retry when the connection returns.");
    } finally { submitting.current = false; setPending(false); }
  }

  return (
    <section className="infra-checkpoint" aria-label="Infrastructure checkpoint">
      <header><span className="eyebrow">CHECKPOINT {position} OF {total}</span><span>{rehearsal ? "Rehearsal · no additional XP" : "15 XP first try · 5 XP guided"}</span></header>
      <h2 tabIndex={-1}>{question.prompt}</h2>
      {question.evidence && <pre className="infra-trace">{question.evidence}</pre>}
      <div className="infra-answer-options" role="group" aria-label="Answer choices">
        {question.options.map((option, index) => {
          const attempted = choices.includes(index);
          const correct = result.complete && index === question.answer;
          return <button key={index} type="button" aria-pressed={selected === index} disabled={pending || result.complete || attempted}
            data-outcome={correct ? "correct" : attempted ? "incorrect" : undefined} onClick={() => setSelected(index)}>
            <span className="infra-answer-letter">{correct ? <Check size={16} /> : String.fromCharCode(65 + index)}</span><span>{option.label}</span>
          </button>;
        })}
      </div>
      {error && <p className="infra-save-error" role="alert">{error}</p>}
      {!result.complete && lastChoice !== undefined && <div className="infra-feedback" role="status"><CircleAlert size={18} /><div><strong>Not this one. Try another.</strong><p>{question.options[lastChoice]?.reason}</p></div></div>}
      {!result.complete && <button type="button" className="button button-primary" disabled={selected === null || pending} onClick={() => void submit()}><Check size={17} />{pending ? "Saving..." : error ? "Retry save" : "Check answer"}</button>}
      {result.complete && <div className="infra-answer-guide" aria-live="polite">
        <span className="eyebrow">{result.independent ? "CORRECT / FIRST TRY" : result.correct ? "CORRECT / GUIDED" : "ANSWER REVIEW"}{!rehearsal && result.xp ? ` / +${result.xp} XP` : ""}</span>
        <h3>{question.takeaway}</h3><p>{question.options[question.answer]?.reason}</p>
        <details><summary>Why the other answers do not hold</summary>{question.options.map((option, index) => index !== question.answer && <div key={index}><strong>{String.fromCharCode(65 + index)}. {option.label}</strong><p>{option.reason}</p></div>)}</details>
        <footer>
          <button type="button" onClick={() => { setRehearsal([]); setSelected(null); }}><RotateCcw size={15} />Rehearse again</button>
          {onNext ? <button type="button" className="button button-primary" onClick={onNext}>Next checkpoint<ArrowRight size={16} /></button> : <Link className="button button-primary" to={nextLesson ? `/learn/infrastructure/${nextLesson}` : "/learn/infrastructure"}>{nextLesson ? "Next module" : "Back to path"}<ArrowRight size={16} /></Link>}
        </footer>
      </div>}
    </section>
  );
}
