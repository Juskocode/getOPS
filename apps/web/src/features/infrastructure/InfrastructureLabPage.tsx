import type { ProgressState } from "@getops/contracts";
import { Activity, ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, ExternalLink, PanelLeftClose, PanelLeftOpen, RotateCcw, Terminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { infraLessonById } from "../../content/infrastructure/catalog";
import { infrastructureLabById, infrastructureLabs, type InfrastructureLab } from "../../content/infrastructure/labs";
import { inspectLabEvidence, labProgress, recordLabChoice } from "../../domain/infrastructure-labs";
import { useProfileState } from "../../state/profile-state";
import { LabDecision } from "./LabDecision";

function LatencyTrace({ values }: { values: number[] }) {
  const [sample, setSample] = useState(values.length - 1);
  const maximum = Math.max(...values);
  const x = (index: number) => 12 + index * 576 / (values.length - 1);
  const y = (value: number) => 94 - value / maximum * 78;
  return <section className="investigation-chart" aria-label="Synthetic latency timeline">
    <header><span><Activity size={15} />Consumer age / synthetic samples</span><strong>{values[sample]} ms <small>at T+{sample * 5}s</small></strong></header>
    <svg viewBox="0 0 600 110" role="img" aria-label={`Consumer age rises from ${values[0]} to ${values.at(-1)} milliseconds across 55 seconds of synthetic observations.`}>
      {[16, 55, 94].map((level) => <line key={level} x1="12" y1={level} x2="588" y2={level} stroke="var(--line)" />)}
      <polyline points={values.map((value, index) => `${x(index)},${y(value)}`).join(" ")} fill="none" stroke="var(--amber)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      <line x1={x(sample)} y1="10" x2={x(sample)} y2="100" stroke="var(--muted)" strokeDasharray="3 4" />
      <circle cx={x(sample)} cy={y(values[sample]!)} r="5" fill="var(--amber)" />
    </svg>
    <input type="range" min="0" max={values.length - 1} step="1" value={sample} aria-label="Inspect timeline sample" aria-valuetext={`T plus ${sample * 5} seconds, ${values[sample]} milliseconds`} onChange={(event) => setSample(Number(event.target.value))} />
    <div className="investigation-chart-axis"><span>T+0s</span><span>Observation window / not live telemetry</span><span>T+55s</span></div>
  </section>;
}

export function InfrastructureLabPage() {
  const { labId } = useParams();
  const lab = labId ? infrastructureLabById.get(labId) : infrastructureLabs[0];
  if (!lab) return <div className="page infra-empty"><h1>Investigation not found</h1><Link className="button" to="/simulate/infrastructure"><ArrowLeft size={16} />Investigations</Link></div>;
  return <LabWorkbench key={lab.id} lab={lab} />;
}

function LabWorkbench({ lab }: { lab: InfrastructureLab }) {
  const { state, save } = useProfileState();
  const [params, setParams] = useSearchParams();
  const [rehearsal, setRehearsal] = useState<ProgressState | null>(null);
  const current = rehearsal ?? state;
  const progress = labProgress(lab, current);
  const [initialStep] = useState(progress.next);
  const requested = Number(params.get("step") ?? initialStep);
  const stepIndex = Number.isInteger(requested) && requested >= 0 ? Math.min(requested, progress.done ? 2 : progress.next) : 0;
  const step = lab.steps[stepIndex]!;
  const decisions = current.infraLabs?.[lab.id]?.decisions ?? [];
  const [activeEvidence, setActiveEvidence] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const focus = params.get("focus") === "1";
  const debrief = params.get("view") === "debrief" && progress.done;
  const allowed = step.requires.every((id) => progress.inspected.includes(id));

  // Normalize blocked deep links once, so later saves cannot silently advance them.
  useEffect(() => {
    const invalidStep = params.has("step") && params.get("step") !== String(stepIndex);
    const blockedDebrief = params.get("view") === "debrief" && !progress.done;
    if (!invalidStep && !blockedDebrief) return;
    const next = new URLSearchParams(params);
    next.set("step", String(stepIndex));
    if (blockedDebrief) next.delete("view");
    setParams(next, { replace: true });
  }, [params, setParams, stepIndex, progress.done]);

  async function commit(update: (previous: ProgressState) => ProgressState) {
    if (submitting.current) return false;
    submitting.current = true; setPending(true); setError("");
    try {
      if (rehearsal !== null) setRehearsal((previous) => update(previous ?? {}));
      else await save(update);
      return true;
    } catch { setError("Could not save. Your selection is retained; retry when the connection returns."); return false; }
    finally { submitting.current = false; setPending(false); }
  }
  function inspect(index: number) {
    setActiveEvidence(index);
    if (!progress.inspected.includes(index)) void commit((previous) => inspectLabEvidence(previous, lab.id, index, new Date().toISOString()));
  }
  function navigateStep(index: number, view = "decision") {
    setParams({ ...(focus ? { focus: "1" } : {}), step: String(index), ...(view === "debrief" ? { view } : {}) });
    setError("");
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }
  const evidence = activeEvidence === null ? null : lab.evidence[activeEvidence];

  return <div className="page investigation-page">
    <header className="investigation-top"><Link className="breadcrumb-link" to="/learn/infrastructure"><ArrowLeft size={16} />Infrastructure path</Link>
      <div><span className="status-label" data-tone="warning">SYNTHETIC LAB</span><button type="button" className="icon-button" title={focus ? "Show case library" : "Focus on investigation"} aria-label={focus ? "Show case library" : "Focus on investigation"} aria-pressed={focus} onClick={() => { const next = new URLSearchParams(params); if (focus) next.delete("focus"); else next.set("focus", "1"); setParams(next); }}>{focus ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button></div></header>
    <div className="investigation-layout" data-focus={focus}>
      {!focus && <aside className="investigation-library"><span className="eyebrow">INCIDENT WORKBENCH</span><h2>Investigations</h2><nav aria-label="Infrastructure investigations">
        {infrastructureLabs.map((item, index) => { const status = labProgress(item, state); return <Link key={item.id} to={`/simulate/infrastructure/${item.id}`} aria-current={item.id === lab.id ? "page" : undefined}>
          <span>{status.done ? <CheckCircle2 size={17} /> : String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><small>{status.completed} / 3 reviewed · {item.minutes} min</small></div></Link>; })}
      </nav><Link className="infra-related-branch" to="/simulate"><Activity size={16} />Trading incident briefings<ArrowRight size={15} /></Link></aside>}
      <article className="investigation-body">
        <header className="investigation-heading"><span className="eyebrow">{lab.subtitle.toUpperCase()}</span><h1 ref={heading} tabIndex={-1}>{lab.title}</h1><p>{lab.symptom}</p><div><Clock3 size={14} />{lab.minutes} min<span>{progress.completed} / 3 decisions reviewed</span>{rehearsal !== null && <strong>REHEARSAL / NOT SAVED</strong>}</div></header>
        {rehearsal !== null && <button type="button" onClick={() => { setRehearsal(null); setActiveEvidence(null); navigateStep(0); }}><ArrowLeft size={15} />End rehearsal</button>}
        <p className="investigation-scope"><strong>Known scope</strong>{lab.scope}</p>
        <LatencyTrace values={lab.trace} />
        <nav className="investigation-steps" aria-label="Investigation stages">{lab.steps.map((item, index) => <button key={item.id} type="button" disabled={pending || (!progress.done && index > progress.next)} aria-current={!debrief && index === stepIndex ? "step" : undefined} onClick={() => navigateStep(index)}><span>{progress.results[index]?.complete ? <Check size={14} /> : index + 1}</span>{item.phase}</button>)}<button type="button" disabled={!progress.done || pending} aria-current={debrief ? "step" : undefined} onClick={() => navigateStep(stepIndex, "debrief")}>Debrief</button></nav>
        {!debrief ? <>
          <section className="investigation-evidence" aria-label="Evidence desk"><header><h2><Terminal size={17} />Evidence desk</h2><span>{progress.inspected.length} / 4 inspected</span></header>
            <div className="investigation-evidence-tabs" role="group" aria-label="Inspect evidence">{lab.evidence.map((item, index) => <button key={item.title} type="button" disabled={pending} aria-pressed={activeEvidence === index} data-required={step.requires.includes(index) && !progress.inspected.includes(index)} onClick={() => inspect(index)}>{progress.inspected.includes(index) ? <Check size={14} /> : <Terminal size={14} />}<span>{item.title}</span>{step.requires.includes(index) && !progress.inspected.includes(index) && <small>Required</small>}</button>)}</div>
            {evidence ? <div className="investigation-evidence-content" key={activeEvidence}>
              <div className="infra-terminal"><div><code>{evidence.command}</code></div><pre>{evidence.output}</pre></div>
              <p className="investigation-boundary"><strong>Evidence boundary</strong>{evidence.boundary}</p>
              {activeEvidence !== null && !progress.inspected.includes(activeEvidence) && <button type="button" disabled={pending} onClick={() => inspect(activeEvidence)}><Check size={16} />{pending ? "Saving inspection..." : "Record inspection"}</button>}
            </div> : <p className="investigation-evidence-empty">{progress.inspected.length ? "No evidence panel selected." : "No evidence inspected yet."}</p>}
          </section>
          <LabDecision key={`${lab.id}-${stepIndex}-${rehearsal !== null}`} step={step} choices={decisions[stepIndex]?.choices ?? []} allowed={allowed} pending={pending} error={error} rehearsal={rehearsal !== null}
            onSubmit={(choice) => commit((previous) => recordLabChoice(previous, lab.id, stepIndex, choice, new Date().toISOString()))}
            onNext={() => navigateStep(Math.min(2, stepIndex + 1), stepIndex === 2 ? "debrief" : "decision")} last={stepIndex === 2} />
        </> : <section className="investigation-debrief" aria-label="Investigation debrief"><span className="eyebrow">INVESTIGATION REVIEWED</span><h2>Evidence to handover</h2>
          <div className="investigation-results"><div><strong>{progress.independent}</strong><span>First try</span></div><div><strong>{progress.guided}</strong><span>Guided</span></div><div><strong>{progress.revealed}</strong><span>Revealed</span></div></div>
          <h3>Operational handover</h3><p>{lab.handoff}</p><h3>Decision record</h3><ol>{lab.steps.map((item, index) => <li key={item.id}><strong>{item.phase}</strong><span>{item.takeaway}</span><small>{progress.results[index]?.independent ? "First try" : progress.results[index]?.correct ? "Guided review" : "Answer revealed"}</small></li>)}</ol>
          <p className="investigation-boundary">Self-study evidence, not an operational certification. Reading a panel records inspection, not proof of understanding. No commands or trading actions are executed.</p>
          <div className="investigation-actions"><button type="button" onClick={() => { setRehearsal({}); setActiveEvidence(null); navigateStep(0); }}><RotateCcw size={16} />Rehearse without XP</button>{rehearsal !== null && <button type="button" onClick={() => { setRehearsal(null); setActiveEvidence(null); navigateStep(0); }}>Return to saved run</button>}
            <Link className="button button-primary" to={`/simulate/infrastructure/${infrastructureLabs[(infrastructureLabs.indexOf(lab) + 1) % infrastructureLabs.length]!.id}`}>Next investigation<ArrowRight size={16} /></Link></div>
        </section>}
        <section className="investigation-references"><h2>Related study</h2><div>{lab.lessons.map((id) => <Link key={id} to={`/learn/infrastructure/${id}`}>{infraLessonById.get(id)?.title}<ArrowRight size={14} /></Link>)}</div><a href={lab.source.url} target="_blank" rel="noreferrer">{lab.source.label}<ExternalLink size={14} /></a></section>
      </article>
    </div>
  </div>;
}
