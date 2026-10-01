import { ArrowRight, CheckCircle2, Clock3, Search, Terminal } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

import { infrastructureLessons } from "../../content/infrastructure/catalog";
import { checkpointResult, infrastructureProgress } from "../../domain/infrastructure";
import { useProfileState } from "../../state/profile-state";
import { LearningTracks } from "../learn/LearningTracks";
import { PacketExplorer } from "./PacketExplorer";

export function InfrastructurePage() {
  const { state } = useProfileState();
  const progress = infrastructureProgress(state);
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("all");
  const filtered = infrastructureLessons.filter((lesson) => (stage === "all" || lesson.stage === stage) &&
    `${lesson.title} ${lesson.subtitle} ${lesson.concepts.map((concept) => concept.body).join(" ")}`.toLowerCase().includes(query.toLowerCase().trim()));
  return (
    <div className="page infra-page">
      <LearningTracks active="infrastructure" />
      <header className="page-header infra-header">
        <div><span className="eyebrow">SYSTEMS ENGINEERING / LEARNING PATH</span><h1>Understand the whole path.</h1><p>From the network card to the trading decision. Eight modules in Linux infrastructure.</p></div>
        <Link className="button button-primary" to={`/learn/infrastructure/${progress.next.id}`}>
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
          <label className="infra-search"><Search size={17} /><input aria-label="Find infrastructure module" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a concept: epoll, NUMA, signals..." /></label>
          <select aria-label="Filter module stage" value={stage} onChange={(event) => setStage(event.target.value)}>
            <option value="all">All stages</option>{["Ingress", "Execution", "System", "Synthesis"].map((name) => <option key={name}>{name}</option>)}
          </select>
        </div>
        <div className="infra-module-list">
          {filtered.map((lesson) => {
            const index = infrastructureLessons.indexOf(lesson);
            const reviewed = lesson.questions.filter((q) => checkpointResult(q, state.infraAnswers?.[q.id]?.choices).complete).length;
            const read = state.infraRead?.includes(lesson.id);
            return <Link className="infra-module-row" key={lesson.id} to={`/learn/infrastructure/${lesson.id}`}>
              <span className="infra-module-number" data-complete={read && reviewed === 4}>{read && reviewed === 4 ? <CheckCircle2 size={19} /> : String(index + 1).padStart(2, "0")}</span>
              <div className="infra-module-title"><span>{lesson.stage}</span><h3>{lesson.title}</h3><p>{lesson.subtitle}</p></div>
              <div className="infra-module-progress"><span>{read ? "Read" : "Not read"} · {reviewed}/4 checks</span><progress value={reviewed} max={4} aria-label={`${lesson.title} checkpoints`} /></div>
              <span className="infra-module-time"><Clock3 size={14} />{lesson.minutes}m</span><ArrowRight size={17} />
            </Link>;
          })}
        </div>
        {!filtered.length && <div className="infra-empty"><Search size={22} /><h3>No matching modules</h3><button type="button" onClick={() => { setQuery(""); setStage("all"); }}>Clear filters</button></div>}
      </section>
      <section className="infra-study-note"><Terminal size={20} /><div><strong>Linux-focused. Production-aware.</strong><p>Command output and incidents are synthetic training examples. Some diagnostics require approval or elevated access. No command runs on your machine from these lessons.</p></div><Link to="/learn/incident">Incident discipline<ArrowRight size={15} /></Link></section>
    </div>
  );
}
