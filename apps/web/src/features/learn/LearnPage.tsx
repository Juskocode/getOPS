import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleDot,
  Clock3,
  Route,
} from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import { Link } from "react-router-dom";

import { flashcards } from "../../content/catalog";
import { branchById, branches } from "../../domain/branches";
import { branchLearningMeta, learningStages } from "../../domain/learning-path";
import { latestAttempts } from "../../state/evidence";
import { useProfileState } from "../../state/profile-state";

export function LearnPage() {
  const { state } = useProfileState();
  const latest = useMemo(() => latestAttempts(state), [state]);
  const branchProgress = useMemo(
    () =>
      new Map(
        branches.map((branch) => {
          const cards = flashcards.filter((card) => card.branch === branch.id);
          const attempts = cards
            .map((card) => latest.get(card.id))
            .filter((attempt) => attempt !== undefined);
          const average = attempts.length
            ? Math.round(
                attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length,
              )
            : 0;
          return [
            branch.id,
            {
              cards,
              attempts,
              average,
              strong: attempts.filter((attempt) => attempt.score >= 80).length,
              coverage: Math.round((attempts.length / cards.length) * 100),
            },
          ];
        }),
      ),
    [latest],
  );
  const totalValidated = [...branchProgress.values()].reduce(
    (sum, progress) => sum + progress.attempts.length,
    0,
  );
  const totalStrong = [...branchProgress.values()].reduce(
    (sum, progress) => sum + progress.strong,
    0,
  );
  const completedBranches = [...branchProgress.values()].filter(
    (progress) => progress.coverage === 100 && progress.average >= 80,
  ).length;
  const nextBranch = [...branches].sort((left, right) => {
    const leftProgress = branchProgress.get(left.id);
    const rightProgress = branchProgress.get(right.id);
    if (!leftProgress || !rightProgress) return 0;
    return leftProgress.coverage - rightProgress.coverage || leftProgress.average - rightProgress.average;
  })[0];

  return (
    <div className="page learn-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">LEARN / COMMAND PATH</span>
          <h1>Operational knowledge path</h1>
          <p>Build market context first, then prove data, trading state, and incident control.</p>
        </div>
        {nextBranch ? (
          <Link className="button button-primary" to={`/learn/${nextBranch.id}`}>
            Continue {nextBranch.shortName} <ArrowRight size={17} />
          </Link>
        ) : null}
      </header>

      <section className="learning-summary" aria-label="Learning path progress">
        <div className="learning-summary-primary">
          <Route size={20} />
          <div>
            <span>Path readiness</span>
            <strong>{Math.round((totalValidated / flashcards.length) * 100)}%</strong>
          </div>
          <div className="path-progress">
            <span style={{ width: `${(totalValidated / flashcards.length) * 100}%` }} />
          </div>
        </div>
        <div><span>Validated recall</span><strong>{totalValidated} / {flashcards.length}</strong></div>
        <div><span>Strong evidence</span><strong>{totalStrong}</strong></div>
        <div><span>Mastered branches</span><strong>{completedBranches} / {branches.length}</strong></div>
      </section>

      <div className="learning-path" aria-label="Trading operations learning stages">
        {learningStages.map((stage, stageIndex) => (
          <section className="learning-stage" key={stage.id}>
            <header>
              <div className="stage-marker">
                <span>{stage.label}</span>
                <strong>{stageIndex + 1}</strong>
              </div>
              <div>
                <h2>{stage.title}</h2>
                <p>{stage.description}</p>
              </div>
            </header>
            <div className="stage-branches">
              {stage.branchIds.map((branchId) => {
                const branch = branchById.get(branchId);
                const guide = branchLearningMeta[branchId];
                const progress = branchProgress.get(branchId);
                if (!branch || !guide || !progress) return null;
                const Icon = branch.icon;
                const status =
                  progress.coverage === 100 && progress.average >= 80
                    ? "Mastered"
                    : progress.attempts.length
                      ? "In progress"
                      : "Ready";
                return (
                  <article
                    key={branch.id}
                    className="path-branch"
                    style={{ "--branch-color": branch.color } as CSSProperties}
                  >
                    <div className="path-branch-head">
                      <span className="path-branch-icon"><Icon size={19} /></span>
                      <div>
                        <span className="path-status">
                          {status === "Mastered" ? <CheckCircle2 size={13} /> : <CircleDot size={13} />}
                          {status}
                        </span>
                        <h3>{branch.name}</h3>
                      </div>
                      <span className="guide-duration"><Clock3 size={13} /> {guide.durationMinutes}m</span>
                    </div>
                    <p>{branch.description}</p>
                    <div className="path-branch-metrics">
                      <div>
                        <span>Coverage</span>
                        <strong>{progress.attempts.length} / {progress.cards.length}</strong>
                      </div>
                      <div>
                        <span>Quality</span>
                        <strong>{progress.average}%</strong>
                      </div>
                      <div>
                        <span>Strong</span>
                        <strong>{progress.strong}</strong>
                      </div>
                    </div>
                    <div className="path-branch-progress">
                      <span style={{ width: `${progress.coverage}%` }} />
                    </div>
                    <footer>
                      <Link to={`/learn/${branch.id}`}>
                        <BookOpenCheck size={16} /> Deep dive
                      </Link>
                      <Link to={`/practice/flashcards?branch=${branch.id}`}>
                        Train <ArrowRight size={15} />
                      </Link>
                    </footer>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
