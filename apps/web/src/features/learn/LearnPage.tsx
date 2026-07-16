import { ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";

import { flashcards } from "../../content/catalog";
import { branches } from "../../domain/branches";
import { latestAttempts } from "../../state/evidence";
import { useProfileState } from "../../state/profile-state";

export function LearnPage() {
  const { state } = useProfileState();
  const latest = latestAttempts(state);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">LEARN</span>
          <h1>Operational knowledge map</h1>
          <p>Coverage is evidence-based: a card counts only after written validation.</p>
        </div>
      </header>

      <section className="branch-table" aria-label="Learning branches">
        <div className="branch-table-header">
          <span>Branch</span>
          <span>Evidence</span>
          <span>Quality</span>
          <span />
        </div>
        {branches.map((branch) => {
          const cards = flashcards.filter((card) => card.branch === branch.id);
          const attempts = cards
            .map((card) => latest.get(card.id))
            .filter((attempt) => attempt !== undefined);
          const average = attempts.length
            ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length)
            : 0;
          const Icon = branch.icon;
          return (
            <article key={branch.id} style={{ "--branch-color": branch.color } as CSSProperties}>
              <div className="branch-name">
                <span><Icon size={18} /></span>
                <div>
                  <strong>{branch.name}</strong>
                  <small>{branch.description}</small>
                </div>
              </div>
              <div>
                <strong>{attempts.length} / {cards.length}</strong>
                <div className="mini-progress">
                  <span style={{ width: `${(attempts.length / cards.length) * 100}%` }} />
                </div>
              </div>
              <div>
                <strong>{average}%</strong>
                <small>{attempts.filter((attempt) => attempt.score >= 80).length} strong</small>
              </div>
              <Link to={`/practice/flashcards?branch=${branch.id}`}>
                Train <ArrowRight size={16} />
              </Link>
            </article>
          );
        })}
      </section>
    </div>
  );
}
