import { CheckCircle2, Database, Save, Server, Trophy } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router";

import { flashcards } from "../../content/catalog";
import { branches } from "../../domain/branches";
import { operatorRanks, rankProgress } from "../../domain/ranks";
import { latestAttempts } from "../../state/evidence";
import { useProfileState } from "../../state/profile-state";

export function ProfilePage() {
  const { state, record, save, isSaving } = useProfileState();
  const [name, setName] = useState(state.displayName ?? "Operator");
  const [objective, setObjective] = useState(
    state.profileObjective ?? "Trading operations next round",
  );
  const latest = useMemo(() => latestAttempts(state), [state]);
  const attempts = [...latest.values()];
  const average = attempts.length
    ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length)
    : 0;
  const rank = rankProgress(Number(state.xp ?? 0));

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">PROGRESS</span>
          <h1>Operator profile</h1>
          <p>Identity, revision ownership, and written evidence.</p>
        </div>
      </header>

      <div className="profile-layout">
        <section className="identity-panel">
          <div className="identity-mark">{name.trim().slice(0, 1).toUpperCase() || "O"}</div>
          <div className="identity-rank">
            <span>OPERATOR GRADE</span>
            <strong>{rank.current.name}</strong>
            <div className="rank-progress"><span style={{ width: `${rank.progress}%` }} /></div>
            <small>{rank.next ? `${rank.xpToNext} XP to ${rank.next.name}` : "Maximum grade reached"}</small>
          </div>
          <label>
            Display name
            <input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Current objective
            <input
              value={objective}
              maxLength={160}
              onChange={(event) => setObjective(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="button button-primary"
            disabled={isSaving}
            onClick={() => {
              void save((current) => ({
                ...current,
                displayName: name.trim() || "Operator",
                profileObjective: objective.trim(),
              })).catch(() => undefined);
            }}
          >
            <Save size={17} /> Save profile
          </button>
        </section>

        <section className="profile-evidence">
          <div className="kpi-grid compact">
            <article>
              <span>Total XP</span>
              <strong>{Number(state.xp ?? 0).toLocaleString()}</strong>
              <small>Rank evidence</small>
            </article>
            <article>
              <span>Validated cards</span>
              <strong>{attempts.length}</strong>
              <small>{attempts.filter((attempt) => attempt.score >= 80).length} strong</small>
            </article>
            <article>
              <span>Recall average</span>
              <strong>{average}%</strong>
              <small>Latest per card</small>
            </article>
            <article>
              <span>Revision</span>
              <strong>{record.revision}</strong>
              <small>{record.transport === "v3" ? "PostgreSQL" : "Legacy bridge"}</small>
            </article>
          </div>

          <section className="runtime-detail">
            <div><Server size={18} /><span>C++ service boundary</span><strong>{record.transport === "v3" ? "ACTIVE" : "PENDING"}</strong></div>
            <div><Database size={18} /><span>PostgreSQL revision truth</span><strong>{record.transport === "v3" ? "ACTIVE" : "PENDING"}</strong></div>
            <div><CheckCircle2 size={18} /><span>Typed client validation</span><strong>ACTIVE</strong></div>
          </section>

          <section className="rank-ladder">
            <div className="section-heading">
              <div>
                <span className="eyebrow">GRADE PATH</span>
                <h2>Operator progression</h2>
              </div>
              <Trophy size={18} />
            </div>
            <div>
              {operatorRanks.map((operatorRank, index) => {
                const reached = rank.xp >= operatorRank.threshold;
                const current = operatorRank.name === rank.current.name;
                return (
                  <div key={operatorRank.name} data-state={current ? "current" : reached ? "reached" : "locked"}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{operatorRank.name}</strong>
                    <small>{operatorRank.threshold.toLocaleString()} XP</small>
                    {current ? <span className="status-label" data-tone="healthy">CURRENT</span> : null}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="coverage-list">
            <div className="section-heading">
              <div>
                <span className="eyebrow">WRITTEN EVIDENCE</span>
                <h2>Branch coverage</h2>
              </div>
              <Link to="/practice/flashcards">Open deck</Link>
            </div>
            {branches.map((branch) => {
              const cards = flashcards.filter((card) => card.branch === branch.id);
              const cardAttempts = cards
                .map((card) => latest.get(card.id))
                .filter((attempt) => attempt !== undefined);
              const pct = Math.round((cardAttempts.length / cards.length) * 100);
              return (
                <div key={branch.id} style={{ "--branch-color": branch.color } as CSSProperties}>
                  <span>{branch.name}</span>
                  <div className="mini-progress"><span style={{ width: `${pct}%` }} /></div>
                  <strong>{cardAttempts.length} / {cards.length}</strong>
                </div>
              );
            })}
          </section>
        </section>
      </div>
    </div>
  );
}
