import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  FileText,
  History,
  RadioTower,
} from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import { Link } from "react-router";

import { flashcards, flashcardsById } from "../../content/catalog";
import { branches } from "../../domain/branches";
import { branchLearningMeta } from "../../domain/learning-path";
import { rankProgress } from "../../domain/ranks";
import { latestAttempts } from "../../state/evidence";
import { useProfileState } from "../../state/profile-state";

export function TodayPage() {
  const { state, record } = useProfileState();
  const latest = useMemo(() => latestAttempts(state), [state]);
  const attempts = [...latest.values()];
  const strong = attempts.filter((attempt) => attempt.score >= 80).length;
  const average = attempts.length
    ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length)
    : 0;
  const rank = rankProgress(Number(state.xp ?? 0));
  const branchStats = branches
    .map((branch) => {
      const cards = flashcards.filter((card) => card.branch === branch.id);
      const branchAttempts = cards
        .map((card) => latest.get(card.id))
        .filter((attempt) => attempt !== undefined);
      const branchAverage = branchAttempts.length
        ? Math.round(
            branchAttempts.reduce((sum, attempt) => sum + attempt.score, 0) /
              branchAttempts.length,
          )
        : 0;
      return {
        branch,
        cards,
        attempts: branchAttempts,
        average: branchAverage,
        coverage: Math.round((branchAttempts.length / cards.length) * 100),
      };
    })
    .sort((left, right) => left.coverage - right.coverage || left.average - right.average);
  const weakest = branchStats[0];
  const nextCard =
    weakest?.cards.find((card) => !latest.has(card.id)) ??
    [...(weakest?.cards ?? [])].sort(
      (left, right) =>
        (latest.get(left.id)?.score ?? 101) - (latest.get(right.id)?.score ?? 101),
    )[0];
  const recent = [...attempts]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 4);

  return (
    <div className="page today-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">TODAY / {rank.current.name.toUpperCase()}</span>
          <h1>Operator command center</h1>
          <p>{state.profileObjective || "Build decision-grade trading operations evidence."}</p>
        </div>
        {nextCard && weakest ? (
          <Link
            className="button button-primary"
            to={`/practice/flashcards?branch=${weakest.branch.id}&card=${nextCard.id}`}
          >
            Resume mission <ArrowRight size={17} />
          </Link>
        ) : null}
      </header>

      <section className="kpi-grid" aria-label="Current evidence">
        <article>
          <span>Operator grade</span>
          <strong>{rank.current.name}</strong>
          <small>{rank.next ? `${rank.xpToNext} XP to ${rank.next.name}` : `${rank.xp.toLocaleString()} XP`}</small>
        </article>
        <article>
          <span>Validated recall</span>
          <strong>{attempts.length} / {flashcards.length}</strong>
          <small>{strong} strong responses</small>
        </article>
        <article>
          <span>Recall quality</span>
          <strong>{average}%</strong>
          <small>{attempts.length ? "Latest evidence per card" : "Baseline open"}</small>
        </article>
        <article>
          <span>Evidence revision</span>
          <strong>{record.revision}</strong>
          <small>{record.transport === "v3" ? "PostgreSQL synchronized" : "Legacy bridge"}</small>
        </article>
      </section>

      {weakest && nextCard ? (
        <section
          className="mission-band"
          style={{ "--branch-color": weakest.branch.color } as CSSProperties}
        >
          <div className="mission-signal"><RadioTower size={20} /></div>
          <div className="mission-copy">
            <span className="eyebrow">NEXT MISSION / {weakest.branch.shortName.toUpperCase()}</span>
            <h2>{nextCard.prompt}</h2>
            <p>{weakest.branch.description}</p>
          </div>
          <div className="mission-meta">
            <span><Clock3 size={14} /> {branchLearningMeta[weakest.branch.id].durationMinutes} min guide</span>
            <span><CheckCircle2 size={14} /> {weakest.attempts.length} / {weakest.cards.length} validated</span>
          </div>
          <div className="mission-actions">
            <Link className="button" to={`/learn/${weakest.branch.id}`}>
              <BookOpenCheck size={16} /> Deep dive
            </Link>
            <Link
              className="button button-primary"
              to={`/practice/flashcards?branch=${weakest.branch.id}&card=${nextCard.id}`}
            >
              Write response <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      ) : null}

      <div className="two-column today-columns">
        <section className="work-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">SHIFT QUEUE</span>
              <h2>Bounded next actions</h2>
            </div>
            <span className="status-label" data-tone="healthy">READY</span>
          </div>
          <ol className="command-list">
            <li>
              <span>01</span>
              <div>
                <strong>Build the model</strong>
                <p>Trace the evidence path and diagnostic runbook for {weakest?.branch.name ?? "Market Mechanics"}.</p>
              </div>
              <Link to={`/learn/${weakest?.branch.id ?? "market"}`}>Open</Link>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Prove written recall</strong>
                <p>Answer from memory and use the server rubric to expose missing concepts.</p>
              </div>
              <Link to={`/practice/flashcards?branch=${weakest?.branch.id ?? "market"}`}>Train</Link>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Transfer under pressure</strong>
                <p>Enter a scenario briefing with a decision and escalation boundary.</p>
              </div>
              <Link to="/simulate">Simulate</Link>
            </li>
          </ol>
        </section>

        <section className="readiness-panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">READINESS GAPS</span>
              <h2>Lowest-evidence branches</h2>
            </div>
            <Link to="/learn">Full path</Link>
          </div>
          <div className="readiness-list">
            {branchStats.slice(0, 5).map((item) => (
              <Link
                key={item.branch.id}
                to={`/learn/${item.branch.id}`}
                style={{ "--branch-color": item.branch.color } as CSSProperties}
              >
                <span className="readiness-dot" />
                <div>
                  <strong>{item.branch.name}</strong>
                  <div className="mini-progress"><span style={{ width: `${item.coverage}%` }} /></div>
                </div>
                <span>{item.coverage}%</span>
                <ArrowRight size={15} />
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="recent-evidence-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">AUDIT TRAIL</span>
            <h2>Recent written evidence</h2>
          </div>
          <Link to="/profile"><History size={15} /> Progress</Link>
        </div>
        {recent.length ? (
          <div className="recent-evidence-list">
            {recent.map((attempt) => {
              const card = flashcardsById.get(attempt.cardId);
              const branch = branches.find((item) => item.id === card?.branch);
              return (
                <Link
                  key={attempt.id}
                  to={`/practice/flashcards?branch=${card?.branch ?? "market"}&card=${attempt.cardId}`}
                >
                  <FileText size={17} />
                  <div>
                    <strong>{card?.prompt ?? attempt.cardId}</strong>
                    <small>{branch?.shortName ?? "Recall"} · {new Date(attempt.createdAt).toLocaleDateString()}</small>
                  </div>
                  <span data-tone={attempt.score >= 80 ? "healthy" : "warning"}>{attempt.score}%</span>
                  <ArrowRight size={15} />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty-evidence compact-empty">
            <strong>No validated responses yet</strong>
            <span>Your first written recall will establish the evidence baseline.</span>
          </div>
        )}
      </section>
    </div>
  );
}
