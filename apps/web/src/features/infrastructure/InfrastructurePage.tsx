import { ArrowRight, CheckCircle2, Clock3, Search, Terminal, FlaskConical } from "lucide-react";
import { Link, useSearchParams } from "react-router";

import { infrastructureLessons } from "../../content/infrastructure/catalog";
import { checkpointResult, infrastructureProgress, lessonNeedsReview, lessonStudyPath } from "../../domain/infrastructure";
import { infrastructureLabProgress } from "../../domain/infrastructure-labs";
import { useProfileState } from "../../state/profile-state";
import { LearningTracks } from "../learn/LearningTracks";
import { PacketExplorer } from "./PacketExplorer";

export function InfrastructurePage() {
  const { state } = useProfileState();
  const progress = infrastructureProgress(state);
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const stage = ["Ingress", "Execution", "System", "Synthesis"].includes(params.get("stage") ?? "") ? params.get("stage")! : "all";
  const status = ["unfinished", "review", "complete"].includes(params.get("status") ?? "") ? params.get("status")! : "all";
  function filter(key: string, value: string) { const next = new URLSearchParams(params); if (!value || value === "all") next.delete(key); else next.set(key, value); setParams(next, { replace: true }); }
  const labs = infrastructureLabProgress(state);
  const filtered = infrastructureLessons.filter((lesson) => {
    const complete = state.infraRead?.includes(lesson.id) && lesson.questions.every((q) => checkpointResult(q, state.infraAnswers?.[q.id]?.choices).complete);
    return (status === "all" || (status === "unfinished" && !complete) || (status === "complete" && complete) || (status === "review" && lessonNeedsReview(state, lesson))) && (stage === "all" || lesson.stage === stage) &&
    `${lesson.title} ${lesson.subtitle} ${lesson.concepts.map((concept) => concept.body).join(" ")}`.toLowerCase().includes(query.toLowerCase().trim());
  });
  return (
    <div className="page infra-page">
      <LearningTracks active="infrastructure" />
      <header className="page-header infra-header">
        <div><span className="eyebrow">SYSTEMS ENGINEERING / LEARNING PATH</span><h1>Understand the whole path.</h1><p>From the network card to the trading decision. Eight modules in Linux infrastructure.</p></div>
        <Link className="button button-primary" to={lessonStudyPath(state, progress.next)}>
          {progress.completed || progress.read ? "Continue learning" : "Start with the NIC"}<ArrowRight size={17} />
        </Link>
      </header>
      <section className="infra-scoreboard" aria-label="Systems learning progress">
        <div><span>Lessons read</span><strong>{progress.read}<small> / 8</small></strong></div>
        <div><span>Checkpoints reviewed</span><strong>{progress.completed}<small> / {progress.total}</small></strong></div>
        <div><span>Correct first try</span><strong>{progress.independent}</strong></div>
        <div><span>Guided / revealed</span><strong>{progress.assisted}<small> / {progress.revealed}</small></strong></div>
      </section>
      <PacketExplorer />
      <section className="infra-curriculum" aria-label="Infrastructure curriculum">
        <header className="section-heading"><div><span className="eyebrow">02 / BUILD THE MODEL</span><h2>The infrastructure path</h2></div><span className="guide-meta"><Clock3 size={15} />{infrastructureLessons.reduce((sum, lesson) => sum + lesson.minutes, 0)} min total</span></header>
        <div className="infra-filters">
          <label className="infra-search"><Search size={17} /><input aria-label="Find infrastructure module" value={query} onChange={(event) => filter("q", event.target.value)} placeholder="Find a concept: epoll, NUMA, signals..." /></label>
          <select aria-label="Filter module stage" value={stage} onChange={(event) => filter("stage", event.target.value)}>
            <option value="all">All stages</option>{["Ingress", "Execution", "System", "Synthesis"].map((name) => <option key={name}>{name}</option>)}
          </select>
          <select aria-label="Filter module progress" value={status} onChange={(event) => filter("status", event.target.value)}><option value="all">All progress</option><option value="unfinished">Unfinished</option><option value="review">Needs review</option><option value="complete">Reviewed</option></select>
        </div>
        <div className="infra-module-list">
          {filtered.map((lesson) => {
            const index = infrastructureLessons.indexOf(lesson);
            const reviewed = lesson.questions.filter((q) => checkpointResult(q, state.infraAnswers?.[q.id]?.choices).complete).length;
            const read = state.infraRead?.includes(lesson.id);
            return <Link className="infra-module-row" key={lesson.id} to={lessonStudyPath(state, lesson, status === "review" ? "review" : "resume")}>
              <span className="infra-module-number" data-complete={read && reviewed === 4}>{read && reviewed === 4 ? <CheckCircle2 size={19} /> : String(index + 1).padStart(2, "0")}</span>
              <div className="infra-module-title"><span>{lesson.stage}</span><h3>{lesson.title}</h3><p>{lesson.subtitle}</p></div>
              <div className="infra-module-progress"><span>{lessonNeedsReview(state, lesson) ? "Needs review" : read ? "Read" : "Not read"} · {reviewed}/4 checks</span><progress value={reviewed} max={4} aria-label={`${lesson.title} checkpoints`} /></div>
              <span className="infra-module-time"><Clock3 size={14} />{lesson.minutes}m</span><ArrowRight size={17} />
            </Link>;
          })}
        </div>
        {!filtered.length && <div className="infra-empty"><Search size={22} /><h3>No matching modules</h3><button type="button" onClick={() => setParams({})}>Clear filters</button></div>}
      </section>
      <section className="infra-lab-entry" aria-label="Infrastructure investigations"><FlaskConical size={24} /><div><span className="eyebrow">03 / APPLY THE EVIDENCE</span><h2>Incident workbench</h2><p>RX queues, CPU budgets, epoll and audit I/O. {labs.completed} / 4 investigations reviewed.</p></div><Link className="button button-primary" to={`/simulate/infrastructure/${labs.next.id}`}>{labs.decisions ? "Resume investigation" : "Start investigation"}<ArrowRight size={16} /></Link></section>
      <section className="infra-study-note"><Terminal size={20} /><div><strong>Linux-focused. Production-aware.</strong><p>Command output and incidents are synthetic training examples. Some diagnostics require approval or elevated access. No command runs on your machine from these lessons.</p></div><Link to="/learn/incident">Incident discipline<ArrowRight size={15} /></Link></section>
    </div>
  );
}
