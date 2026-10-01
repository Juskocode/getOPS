import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, ClipboardCheck, Copy, ExternalLink, Menu, Terminal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { infraLessonById, infrastructureLessons } from "../../content/infrastructure/catalog";
import { checkpointResult } from "../../domain/infrastructure";
import { useProfileState } from "../../state/profile-state";
import { CheckpointRunner } from "./CheckpointRunner";

const views = [{ id: "concepts", label: "Concepts", icon: BookOpen }, { id: "commands", label: "Command lab", icon: Terminal }, { id: "checkpoints", label: "Checkpoints", icon: ClipboardCheck }];

function CopyCommand({ command }: { command: string }) {
  const [status, setStatus] = useState("");
  return <button type="button" title="Copy command" aria-label={`Copy ${command}`} onClick={() => {
    void navigator.clipboard.writeText(command).then(() => setStatus("Copied"), () => setStatus("Copy unavailable"));
  }}>{status || <Copy size={15} />}</button>;
}

export function InfrastructureLessonPage() {
  const { lessonId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { state, save, isSaving } = useProfileState();
  const [outline, setOutline] = useState(false);
  const [saveError, setSaveError] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const lesson = infraLessonById.get(lessonId);
  const view = views.some((item) => item.id === params.get("view")) ? params.get("view")! : "concepts";
  const questionIndex = Math.max(0, Math.min((lesson?.questions.length ?? 1) - 1, Number(params.get("q")) || 0));
  const safeIndex = Number.isInteger(questionIndex) ? questionIndex : 0;

  useEffect(() => { setOutline(false); setSaveError(""); }, [lessonId]);
  useEffect(() => { if (view === "checkpoints") heading.current?.focus({ preventScroll: true }); }, [view, safeIndex]);

  if (!lesson) return <div className="page infra-empty"><h1>Module not found</h1><p>This learning link does not identify a current module.</p><Link className="button" to="/learn/infrastructure"><ArrowLeft size={16} />Infrastructure path</Link></div>;
  const index = infrastructureLessons.indexOf(lesson);
  const next = infrastructureLessons[index + 1];
  const prerequisite = lesson.prerequisite ? infraLessonById.get(lesson.prerequisite) : null;
  const read = state.infraRead?.includes(lesson.id) ?? false;
  const completed = lesson.questions.filter((q) => checkpointResult(q, state.infraAnswers?.[q.id]?.choices).complete).length;

  async function markRead() {
    if (!lesson) return;
    setSaveError("");
    try { await save((current) => ({ ...current, infraRead: read ? (current.infraRead ?? []).filter((id) => id !== lesson.id) : [...new Set([...(current.infraRead ?? []), lesson.id])] as NonNullable<typeof current.infraRead> })); }
    catch { setSaveError("Reading progress could not be saved. Try again."); }
  }

  return <div className="page infra-lesson-page">
    <header className="infra-lesson-top"><Link className="breadcrumb-link" to="/learn/infrastructure"><ArrowLeft size={16} />Infrastructure path</Link><span>{index + 1} / {infrastructureLessons.length} modules</span>
      <button type="button" className="infra-outline-toggle" aria-expanded={outline} onClick={() => setOutline(!outline)}>{outline ? <X size={16} /> : <Menu size={16} />}Modules</button></header>
    <div className="infra-lesson-layout">
      <aside className="infra-outline" data-open={outline}>
        <span className="eyebrow">SYSTEMS & INFRASTRUCTURE</span><h2>The learning path</h2>
        <nav aria-label="Infrastructure modules">{infrastructureLessons.map((item, n) => <Link key={item.id} to={`/learn/infrastructure/${item.id}`} aria-current={item.id === lessonId ? "page" : undefined}>
          <span>{state.infraRead?.includes(item.id) ? <CheckCircle2 size={16} /> : String(n + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><small>{item.minutes} min · {item.stage}</small></div>
        </Link>)}</nav>
        <Link className="infra-related-branch" to={`/learn/${lesson.connectsTo}`}><BookOpen size={16} />Trading operations connection<ArrowRight size={15} /></Link>
      </aside>
      <article className="infra-lesson-body">
        <header className="infra-lesson-heading"><span className="eyebrow">MODULE {String(index + 1).padStart(2, "0")} / {lesson.stage.toUpperCase()} / {lesson.minutes} MIN</span><h1 ref={heading} tabIndex={-1}>{lesson.title}</h1><p>{lesson.subtitle}</p>
          <div className="infra-lesson-meta"><span>{completed} / 4 checkpoints reviewed</span>{prerequisite && <Link to={`/learn/infrastructure/${prerequisite.id}`}>Before this: {prerequisite.title}<ArrowRight size={13} /></Link>}</div></header>
        <nav className="infra-view-tabs" aria-label="Module views">{views.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setParams(id === "concepts" ? {} : { view: id })}><Icon size={16} />{label}</button>)}</nav>
        <div className="infra-lesson-content" key={`${lesson.id}-${view}`}>
          {view === "concepts" && <>
            <ul className="infra-objectives">{lesson.objectives.map((objective) => <li key={objective}><Check size={15} />{objective}</li>)}</ul>
            {lesson.concepts.map((concept, n) => <section className="infra-concept" key={concept.title}><span className="infra-concept-number">0{n + 1}</span><div><h2>{concept.title}</h2><p>{concept.body}</p><div className="infra-operational-note"><span>AT THE OPERATIONS DESK</span><p>{concept.operational}</p></div></div></section>)}
            <section className="infra-interview"><span className="eyebrow">INTERVIEW TRANSFER</span><h2>{lesson.interview.prompt}</h2><details><summary>Compare with a model answer</summary><p>{lesson.interview.answer}</p></details></section>
            <div className="infra-lesson-footer"><button type="button" aria-pressed={read} disabled={isSaving} onClick={() => void markRead()}><CheckCircle2 size={17} />{read ? "Read complete" : "Mark as read"}</button><button type="button" className="button button-primary" onClick={() => setParams({ view: "commands" })}>Command lab<ArrowRight size={16} /></button></div>
            {saveError && <p role="alert" className="infra-save-error">{saveError}</p>}
          </>}
          {view === "commands" && <>
            <div className="infra-lab-context"><Terminal size={18} /><p>Synthetic Linux examples. Names, PIDs and numbers are illustrative. These commands are not executed here; read each safety boundary before real use.</p></div>
            {lesson.commands.map((lab, n) => <section className="infra-command-lab" key={lab.command}><header><span className="eyebrow">OBSERVATION 0{n + 1}</span></header><div className="infra-terminal"><div><code>{lab.command}</code>{!lab.command.startsWith("#") && <CopyCommand command={lab.command} />}</div><pre>{lab.output}</pre></div><h3>What this supports</h3><p>{lab.interpretation}</p><div className="infra-command-boundary"><strong>Limits & safety</strong><p>{lab.boundary}</p></div></section>)}
            <div className="infra-lesson-footer"><span>Evidence first. Changes second.</span><button type="button" className="button button-primary" onClick={() => setParams({ view: "checkpoints" })}>Test your judgement<ArrowRight size={16} /></button></div>
          </>}
          {view === "checkpoints" && <>
            <nav className="infra-question-nav" aria-label="Module checkpoints">{lesson.questions.map((q, n) => {
              const status = checkpointResult(q, state.infraAnswers?.[q.id]?.choices);
              return <button key={q.id} type="button" aria-current={n === safeIndex ? "step" : undefined} aria-label={`Checkpoint ${n + 1}${status.complete ? ", reviewed" : ""}`} onClick={() => setParams({ view: "checkpoints", q: String(n) })}>{status.complete ? <Check size={14} /> : n + 1}</button>;
            })}</nav>
            <CheckpointRunner key={`${lesson.id}-${safeIndex}`} question={lesson.questions[safeIndex]!} position={safeIndex + 1} total={lesson.questions.length} onNext={safeIndex < lesson.questions.length - 1 ? () => { setParams({ view: "checkpoints", q: String(safeIndex + 1) }); heading.current?.scrollIntoView({ block: "start" }); } : undefined} nextLesson={next?.id} />
          </>}
        </div>
        <section className="infra-sources"><h2>Primary references</h2>{lesson.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={14} /></a>)}</section>
      </article>
    </div>
  </div>;
}
