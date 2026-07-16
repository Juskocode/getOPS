import { ArrowRight, CheckCircle2, Database, Server, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { flashcards } from "../../content/catalog";
import { branches } from "../../domain/branches";
import { latestAttempts } from "../../state/evidence";
import { useProfileState } from "../../state/profile-state";

export function TodayPage() {
  const { state, record } = useProfileState();
  const latest = latestAttempts(state);
  const attempts = [...latest.values()];
  const strong = attempts.filter((attempt) => attempt.score >= 80).length;
  const average = attempts.length
    ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length)
    : 0;
  const weakestBranch = branches
    .map((branch) => ({
      branch,
      completed: flashcards.filter(
        (card) => card.branch === branch.id && latest.has(card.id),
      ).length,
      total: flashcards.filter((card) => card.branch === branch.id).length,
    }))
    .sort((left, right) => left.completed / left.total - right.completed / right.total)[0];

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">TODAY</span>
          <h1>Operator command center</h1>
          <p>Build evidence from the weakest operational boundary first.</p>
        </div>
        <Link className="button button-primary" to="/practice/flashcards">
          Start recall run
          <ArrowRight size={17} />
        </Link>
      </header>

      <section className="kpi-grid" aria-label="Current evidence">
        <article>
          <span>Total XP</span>
          <strong>{Number(state.xp ?? 0).toLocaleString()}</strong>
          <small>Revision {record.revision}</small>
        </article>
        <article>
          <span>Validated recall</span>
          <strong>{attempts.length} / {flashcards.length}</strong>
          <small>{strong} strong responses</small>
        </article>
        <article>
          <span>Recall quality</span>
          <strong>{average}%</strong>
          <small>{attempts.length ? "Latest card evidence" : "Baseline open"}</small>
        </article>
        <article>
          <span>Next branch</span>
          <strong>{weakestBranch?.branch.shortName ?? "Market"}</strong>
          <small>{weakestBranch?.completed ?? 0} / {weakestBranch?.total ?? 0} validated</small>
        </article>
      </section>

      <div className="two-column">
        <section className="work-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">SHIFT QUEUE</span>
              <h2>Next bounded actions</h2>
            </div>
            <span className="status-label" data-tone="healthy">READY</span>
          </div>
          <ol className="command-list">
            <li>
              <span>01</span>
              <div>
                <strong>Written recall</strong>
                <p>Validate one answer in {weakestBranch?.branch.name ?? "Market Mechanics"}.</p>
              </div>
              <Link to={`/practice/flashcards?branch=${weakestBranch?.branch.id ?? "market"}`}>
                Open
              </Link>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Branch review</strong>
                <p>Inspect coverage before adding more volume.</p>
              </div>
              <Link to="/learn">Review</Link>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Pressure transfer</strong>
                <p>Continue a specialist simulation in the migration fallback.</p>
              </div>
              <a href="/legacy/">Launch</a>
            </li>
          </ol>
        </section>

        <section className="architecture-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">RUNTIME</span>
              <h2>Evidence path</h2>
            </div>
          </div>
          <div className="architecture-flow" aria-label="Client server persistence path">
            <div>
              <Sparkles size={20} />
              <strong>React</strong>
              <small>Decision surface</small>
            </div>
            <ArrowRight aria-hidden="true" />
            <div>
              <Server size={20} />
              <strong>C++</strong>
              <small>Validation authority</small>
            </div>
            <ArrowRight aria-hidden="true" />
            <div>
              <Database size={20} />
              <strong>PostgreSQL</strong>
              <small>Revision truth</small>
            </div>
          </div>
          <ul className="invariant-list">
            <li><CheckCircle2 size={16} /> Explicit ETag ownership</li>
            <li><CheckCircle2 size={16} /> Server-authoritative recall score</li>
            <li><CheckCircle2 size={16} /> Append-only revision evidence</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
