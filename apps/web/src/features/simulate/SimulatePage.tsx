import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpenCheck,
  ChevronRight,
  RadioTower,
  ShieldAlert,
  Siren,
} from "lucide-react";
import { type CSSProperties } from "react";
import { Link, useSearchParams } from "react-router";

import { branchById } from "../../domain/branches";
import { scenarioBriefings } from "../../domain/scenario-briefings";

const initialScenario = scenarioBriefings[0]!;

export function SimulatePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("scenario") ?? initialScenario.id;
  const scenario =
    scenarioBriefings.find((candidate) => candidate.id === selectedId) ?? initialScenario;
  const branch = branchById.get(scenario.branchId);

  return (
    <div
      className="page simulate-page"
      style={{ "--branch-color": branch?.color ?? "var(--blue)" } as CSSProperties}
    >
      <header className="page-header">
        <div>
          <span className="eyebrow">SIMULATE / PRESSURE BRIEFING</span>
          <h1>Scenario desk</h1>
          <p>Read incomplete telemetry, make the first safe decision, and name the control boundary.</p>
        </div>
        <a className="button button-primary" href="/legacy/">
          Open pressure engine <ArrowUpRight size={17} />
        </a>
      </header>

      <section className="scenario-summary" aria-label="Scenario library summary">
        <div><Siren size={18} /><span>Briefings</span><strong>{scenarioBriefings.length}</strong></div>
        <div><RadioTower size={18} /><span>Live signals</span><strong>{scenarioBriefings.reduce((sum, item) => sum + item.signals.length, 0)}</strong></div>
        <div><ShieldAlert size={18} /><span>SEV-1 drills</span><strong>{scenarioBriefings.filter((item) => item.severity === "SEV-1").length}</strong></div>
        <div><Activity size={18} /><span>Decision path</span><strong>Signal → control</strong></div>
      </section>

      <div className="scenario-workspace">
        <aside className="scenario-queue" aria-label="Scenario briefings">
          <div className="section-heading">
            <div>
              <span className="eyebrow">INCIDENT QUEUE</span>
              <h2>Choose a briefing</h2>
            </div>
          </div>
          <div>
            {scenarioBriefings.map((candidate, index) => {
              const candidateBranch = branchById.get(candidate.branchId);
              return (
                <button
                  key={candidate.id}
                  type="button"
                  className={candidate.id === scenario.id ? "is-active" : ""}
                  aria-pressed={candidate.id === scenario.id}
                  onClick={() => setSearchParams({ scenario: candidate.id })}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{candidate.title}</strong>
                    <small>{candidateBranch?.shortName} · {candidate.severity}</small>
                  </div>
                  <ChevronRight size={16} />
                </button>
              );
            })}
          </div>
        </aside>

        <main className="scenario-briefing" key={scenario.id}>
          <header>
            <div>
              <span className="branch-badge" style={{ "--branch-color": branch?.color } as CSSProperties}>
                {branch?.name ?? scenario.branchId}
              </span>
              <span className="severity-badge" data-severity={scenario.severity}>{scenario.severity}</span>
            </div>
            <h2>{scenario.title}</h2>
            <p>{scenario.symptom}</p>
          </header>

          <section className="telemetry-tape">
            <div className="section-heading">
              <div>
                <span className="eyebrow">TELEMETRY TAPE</span>
                <h3>First observable evidence</h3>
              </div>
              <span>UTC+1</span>
            </div>
            <div>
              {scenario.signals.map((signal) => (
                <article key={`${signal.time}-${signal.source}`} data-tone={signal.tone}>
                  <time>{signal.time}</time>
                  <strong>{signal.source}</strong>
                  <span>{signal.reading}</span>
                  <i aria-label={signal.tone} />
                </article>
              ))}
            </div>
          </section>

          <section className="scenario-decision">
            <div>
              <span>01 / DECISION</span>
              <h3>What must be decided?</h3>
              <p>{scenario.decision}</p>
            </div>
            <div>
              <span>02 / OPENING MOVE</span>
              <h3>First bounded action</h3>
              <p>{scenario.openingMove}</p>
            </div>
            <div>
              <span>03 / CONTROL</span>
              <h3>Escalation boundary</h3>
              <p>{scenario.controlBoundary}</p>
            </div>
          </section>

          <footer>
            <Link className="button" to={`/learn/${scenario.branchId}?view=runbook`}>
              <BookOpenCheck size={16} /> Review runbook
            </Link>
            <a className="button button-primary" href="/legacy/">
              Enter scored lab <ArrowRight size={16} />
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}
