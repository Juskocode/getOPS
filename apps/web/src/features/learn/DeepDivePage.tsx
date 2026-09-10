import type { BranchId } from "@getops/contracts";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Route,
  ScanSearch,
  Timer,
} from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";

import { flashcards } from "../../content/catalog";
import { branchById } from "../../domain/branches";
import { deepDiveByBranch } from "../../domain/deep-dives";
import { latestAttempts } from "../../state/evidence";
import { useProfileState } from "../../state/profile-state";

type GuideView = "models" | "runbook" | "drills";

const guideViews: Array<{ id: GuideView; label: string; icon: typeof BookOpenCheck }> = [
  { id: "models", label: "Mental model", icon: BookOpenCheck },
  { id: "runbook", label: "Operator runbook", icon: ClipboardCheck },
  { id: "drills", label: "Failure lab", icon: ScanSearch },
];

function isGuideView(value: string | null): value is GuideView {
  return guideViews.some((view) => view.id === value);
}

export function DeepDivePage() {
  const { branchId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { state } = useProfileState();
  const branch = branchById.get(branchId as BranchId);
  const guide = deepDiveByBranch.get(branchId as BranchId);
  const selectedView = searchParams.get("view");
  const activeView: GuideView = isGuideView(selectedView) ? selectedView : "models";
  const latest = useMemo(() => latestAttempts(state), [state]);

  if (!branch || !guide) return <Navigate to="/learn" replace />;

  const cards = flashcards.filter((card) => card.branch === branch.id);
  const attempts = cards
    .map((card) => latest.get(card.id))
    .filter((attempt) => attempt !== undefined);
  const strong = attempts.filter((attempt) => attempt.score >= 80).length;
  const average = attempts.length
    ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length)
    : 0;
  const nextCard =
    cards.find((card) => !latest.has(card.id)) ??
    [...cards].sort(
      (left, right) =>
        (latest.get(left.id)?.score ?? 101) - (latest.get(right.id)?.score ?? 101),
    )[0];
  const progress = Math.round((attempts.length / cards.length) * 100);

  function selectView(view: GuideView) {
    setSearchParams(view === "models" ? {} : { view }, { replace: true });
  }

  return (
    <div
      className="page deep-dive-page"
      style={{ "--branch-color": branch.color } as CSSProperties}
    >
      <Link className="breadcrumb-link" to="/learn">
        <ArrowLeft size={16} /> Learning path
      </Link>

      <header className="deep-dive-header">
        <div className="deep-dive-title">
          <span className="deep-dive-icon" aria-hidden="true"><branch.icon size={24} /></span>
          <div>
            <span className="eyebrow">{guide.level.toUpperCase()} / {guide.durationMinutes} MIN</span>
            <h1>{branch.name}</h1>
            <p>{guide.objective}</p>
          </div>
        </div>
        <div className="deep-dive-actions">
          <div className="guide-progress-summary" aria-label={`${progress}% branch coverage`}>
            <span>{attempts.length} / {cards.length} validated</span>
            <strong>{average}% quality</strong>
            <div className="mini-progress"><span style={{ width: `${progress}%` }} /></div>
          </div>
          {nextCard ? (
            <Link
              className="button button-primary"
              to={`/practice/flashcards?branch=${branch.id}&card=${nextCard.id}`}
            >
              Train next card <ArrowRight size={17} />
            </Link>
          ) : null}
        </div>
      </header>

      <section className="anchor-statement" aria-label="Operational anchor">
        <Route size={19} />
        <div>
          <span>Operational anchor</span>
          <strong>{guide.anchor}</strong>
        </div>
      </section>

      <section className="signal-path-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SIGNAL PATH</span>
            <h2>Trace the evidence boundary</h2>
          </div>
          <span className="guide-meta"><Timer size={14} /> {guide.signalPath.length} boundaries</span>
        </div>
        <div className="signal-path" aria-label={`${branch.name} signal path`}>
          {guide.signalPath.map((stage, index) => (
            <div className="signal-stage" key={stage.label}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{stage.label}</strong>
              <small>{stage.inspect}</small>
              {index < guide.signalPath.length - 1 ? <ArrowRight aria-hidden="true" size={16} /> : null}
            </div>
          ))}
        </div>
      </section>

      <div className="deep-dive-layout">
        <main className="guide-main">
          <nav className="guide-tabs" aria-label="Deep dive views">
            {guideViews.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={activeView === id}
                className={activeView === id ? "is-active" : ""}
                onClick={() => selectView(id)}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </nav>

          <div className="guide-view" key={activeView}>
            {activeView === "models" ? (
              <>
                <div className="guide-section-heading">
                  <span className="eyebrow">CONCEPTUAL CONTROL</span>
                  <h2>Models that change the decision</h2>
                  <p>Use each model to choose the next discriminating check.</p>
                </div>
                <div className="mental-model-grid">
                  {guide.mentalModels.map((model, index) => (
                    <article key={model.title}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <h3>{model.title}</h3>
                      <p>{model.explanation}</p>
                      <div>
                        <strong>Operator question</strong>
                        <small>{model.operatorQuestion}</small>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : null}

            {activeView === "runbook" ? (
              <>
                <div className="guide-section-heading">
                  <span className="eyebrow">DECISION SEQUENCE</span>
                  <h2>From signal to controlled closure</h2>
                  <p>Each phase pairs an action with evidence and an escalation boundary.</p>
                </div>
                <ol className="runbook-timeline">
                  {guide.runbook.map((step, index) => (
                    <li key={`${step.phase}-${step.action}`}>
                      <span className="runbook-index">{index + 1}</span>
                      <div className="runbook-phase">
                        <small>PHASE</small>
                        <strong>{step.phase}</strong>
                      </div>
                      <div>
                        <small>ACTION</small>
                        <strong>{step.action}</strong>
                      </div>
                      <div>
                        <small>EVIDENCE</small>
                        <span>{step.evidence}</span>
                      </div>
                      <div>
                        <small>CONTROL BOUNDARY</small>
                        <span>{step.escalation}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            ) : null}

            {activeView === "drills" ? (
              <>
                <div className="guide-section-heading">
                  <span className="eyebrow">DIAGNOSTIC PRESSURE</span>
                  <h2>Separate symptom from cause</h2>
                  <p>Compare before acting, then state the operational interpretation.</p>
                </div>
                <div className="failure-table">
                  <div className="failure-table-head">
                    <span>Observed symptom</span>
                    <span>Discriminating comparison</span>
                    <span>Operational interpretation</span>
                  </div>
                  {guide.failures.map((failure) => (
                    <article key={failure.symptom}>
                      <strong><CircleAlert size={16} /> {failure.symptom}</strong>
                      <span>{failure.compare}</span>
                      <span>{failure.interpretation}</span>
                    </article>
                  ))}
                </div>

                <div className="checkpoint-section">
                  <div className="guide-section-heading compact-heading">
                    <span className="eyebrow">ANSWER GUIDE</span>
                    <h2>Interview checkpoints</h2>
                  </div>
                  <div className="checkpoint-list">
                    {guide.checkpoints.map((checkpoint, index) => (
                      <details key={checkpoint.question}>
                        <summary>
                          <span>Q{index + 1}</span>
                          <strong>{checkpoint.question}</strong>
                        </summary>
                        <p>{checkpoint.answer}</p>
                      </details>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </main>

        <aside className="guide-sidebar">
          <section>
            <div className="section-heading">
              <div>
                <span className="eyebrow">INVARIANTS</span>
                <h2>Keep these true</h2>
              </div>
              <CheckCircle2 size={18} />
            </div>
            <ul>
              {guide.invariants.map((invariant) => (
                <li key={invariant}><CheckCircle2 size={15} /> <span>{invariant}</span></li>
              ))}
            </ul>
          </section>
          <section className="branch-evidence-summary">
            <span className="eyebrow">BRANCH EVIDENCE</span>
            <div><span>Validated</span><strong>{attempts.length}</strong></div>
            <div><span>Strong</span><strong>{strong}</strong></div>
            <div><span>Quality</span><strong>{average}%</strong></div>
          </section>
        </aside>
      </div>

      <section className="related-cards-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">TRANSFER TO RECALL</span>
            <h2>Apply the guide</h2>
          </div>
          <Link to={`/practice/flashcards?branch=${branch.id}`}>
            View all {cards.length} cards <ArrowRight size={15} />
          </Link>
        </div>
        <div className="related-card-grid">
          {cards.slice(0, 6).map((card) => {
            const attempt = latest.get(card.id);
            return (
              <Link key={card.id} to={`/practice/flashcards?branch=${branch.id}&card=${card.id}`}>
                <span>{card.id.toUpperCase()}</span>
                <strong>{card.prompt}</strong>
                <small>{attempt ? `${attempt.score}% latest evidence` : "Unvalidated"}</small>
                <ArrowRight size={16} />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
