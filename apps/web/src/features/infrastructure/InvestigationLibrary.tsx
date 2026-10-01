import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Filter, RotateCcw, Search, Terminal } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { filterInvestigations, infrastructureLabProgress, labProgress, labReviewQueue, labStudyPath } from "../../domain/infrastructure-labs";
import { useProfileState } from "../../state/profile-state";

export function InvestigationLibrary() {
  const { state } = useProfileState();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const boundary = ["Network", "Execution", "Unix"].includes(params.get("boundary") ?? "") ? params.get("boundary")! : "all";
  const status = ["new", "active", "review", "complete"].includes(params.get("status") ?? "") ? params.get("status")! : "all";
  const progress = infrastructureLabProgress(state);
  const reviews = labReviewQueue(state);
  const filtered = filterInvestigations(state, query, boundary, status);
  const allDone = progress.completed === progress.total;
  function filter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  }
  return <div className="page investigation-catalog">
    <Link className="breadcrumb-link" to="/learn/infrastructure"><ArrowLeft size={15} />Infrastructure path</Link>
    <header className="page-header"><div><span className="eyebrow">SIMULATE / SYSTEMS ENGINEERING</span><h1>Incident workbench</h1><p>Find the boundary. Protect trading. Prove recovery.</p></div>
      <Link className="button button-primary" to={allDone && reviews[0] ? reviews[0].to : labStudyPath(progress.next, state)}>{allDone ? reviews.length ? "Review a decision" : "Open debrief" : progress.decisions ? "Continue investigation" : "Start investigation"}<ArrowRight size={16} /></Link></header>
    <section className="investigation-metrics" aria-label="Investigation progress"><div><span>Cases reviewed</span><strong>{progress.completed}<small> / {progress.total}</small></strong></div><div><span>Decisions reviewed</span><strong>{progress.decisions}<small> / {progress.total * 3}</small></strong></div><div><span>First-try correct</span><strong>{progress.independent}</strong></div><div><span>Review queue</span><strong>{reviews.length}</strong></div></section>
    {reviews.length > 0 && <section className="investigation-review-queue" aria-label="Decision review queue"><header><div><span className="eyebrow">TARGETED PRACTICE</span><h2>Return to the uncertain decisions</h2></div><RotateCcw size={19} /></header><div>{reviews.slice(0, 3).map((item) => <Link key={item.step.id} to={item.to}><span className="status-label" data-tone="warning">{item.revealed ? "Revealed" : "Guided"}</span><div><strong>{item.step.prompt}</strong><small>{item.lab.title} / {item.step.phase}</small></div><ArrowRight size={16} /></Link>)}</div>{reviews.length > 3 && <button type="button" onClick={() => { const next = new URLSearchParams(); next.set("status", "review"); setParams(next); }}>All {reviews.length} review decisions<ArrowRight size={15} /></button>}</section>}
    <section aria-label="Investigation library"><header className="section-heading"><div><span className="eyebrow">CASE LIBRARY</span><h2>Choose an investigation</h2></div><span className="guide-meta">{filtered.length} cases</span></header>
      <div className="investigation-filters"><label><Search size={16} /><input aria-label="Search investigations" placeholder="epoll, mutex, descriptor..." value={query} onChange={(event) => filter("q", event.target.value)} /></label><select aria-label="Filter investigation boundary" value={boundary} onChange={(event) => filter("boundary", event.target.value)}><option value="all">All boundaries</option>{["Network", "Execution", "Unix"].map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter investigation progress" value={status} onChange={(event) => filter("status", event.target.value)}><option value="all">All progress</option><option value="new">Not started</option><option value="active">In progress</option><option value="review">Needs review</option><option value="complete">Reviewed</option></select></div>
      <div className="investigation-case-list">{filtered.map((lab) => {
        const run = labProgress(lab, state);
        const started = run.inspected.length > 0 || run.completed > 0;
        return <Link className="investigation-case" key={lab.id} to={labStudyPath(lab, state, status === "review")}>
          <span className="investigation-case-icon">{run.done ? <CheckCircle2 size={22} /> : <Terminal size={22} />}</span>
          <div><div className="investigation-case-tags"><span className="investigation-level" data-level={lab.level}>{lab.level}</span><span>{lab.boundary}</span></div><h3>{lab.title}</h3><p>{lab.subtitle}</p></div>
          <div className="investigation-case-state"><strong>{run.done ? "Reviewed" : started ? "In progress" : "Not started"}</strong><span>{run.completed} / 3 decisions</span><progress value={run.completed} max={3} aria-label={`${lab.title} progress`} /></div>
          <span className="investigation-case-time"><Clock3 size={14} />{lab.minutes} min</span><ArrowRight size={17} />
        </Link>;
      })}</div>
      {!filtered.length && <div className="infra-empty"><Filter size={24} /><h3>No matching investigations</h3><button type="button" onClick={() => setParams({})}>Clear filters</button></div>}
    </section>
    <p className="investigation-catalog-note">Synthetic evidence. Self-study results, not an operational certification. No commands run against your machine.</p>
  </div>;
}
