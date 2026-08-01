import type {
  BranchId,
  FlashAttempt,
  RecallValidationResponse,
} from "@getops/contracts";
import {
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  CircleDot,
  Eye,
  Filter,
  RefreshCw,
  Save,
  Search,
  Shuffle,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link, useSearchParams } from "react-router";

import { apiClient } from "../../api/client";
import { flashcards } from "../../content/catalog";
import { branchById, branches } from "../../domain/branches";
import { latestAttempts, recallReward } from "../../state/evidence";
import { useProfileState } from "../../state/profile-state";

type EvidenceFilter = "all" | "unvalidated" | "validated" | "needs-review" | "strong";

function attemptId(cardId: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `flash-${cardId}-${suffix}`.slice(0, 100);
}

export function FlashcardsPage() {
  const { state, save, isSaving } = useProfileState();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedBranch = searchParams.get("branch");
  const initialBranch = branches.some((branch) => branch.id === requestedBranch)
    ? (requestedBranch as BranchId)
    : "all";
  const [branchFilter, setBranchFilter] = useState<BranchId | "all">(initialBranch);
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceFilter>("all");
  const [query, setQuery] = useState("");
  const latest = useMemo(() => latestAttempts(state), [state]);
  const filtered = useMemo(
    () =>
      flashcards.filter((card) => {
        if (branchFilter !== "all" && card.branch !== branchFilter) return false;
        if (
          query.trim() &&
          !`${card.prompt} ${card.answer}`.toLowerCase().includes(query.trim().toLowerCase())
        ) return false;
        const attempt = latest.get(card.id);
        if (evidenceFilter === "unvalidated") return !attempt;
        if (evidenceFilter === "validated") return Boolean(attempt);
        if (evidenceFilter === "needs-review") return Boolean(attempt && attempt.score < 80);
        if (evidenceFilter === "strong") return Boolean(attempt && attempt.score >= 80);
        return true;
      }),
    [branchFilter, evidenceFilter, latest, query],
  );
  const preferredId = searchParams.get("card") || state.flashActiveId || filtered[0]?.id;
  const activeIndex = Math.max(0, filtered.findIndex((card) => card.id === preferredId));
  const activeCard = filtered[activeIndex] ?? filtered[0];
  const savedDraft = activeCard ? state.flashDrafts?.[activeCard.id]?.text ?? "" : "";
  const [answer, setAnswer] = useState(savedDraft);
  const [result, setResult] = useState<RecallValidationResponse | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [validationError, setValidationError] = useState("");
  const draftTimer = useRef<number | null>(null);

  useEffect(() => {
    setAnswer(activeCard ? state.flashDrafts?.[activeCard.id]?.text ?? "" : "");
    setResult(null);
    setRevealed(false);
    setValidationError("");
  }, [activeCard?.id]);

  useEffect(() => {
    if (!activeCard || answer === savedDraft) return;
    if (draftTimer.current) globalThis.clearTimeout(draftTimer.current);
    draftTimer.current = globalThis.setTimeout(() => {
      void save((current) => ({
        ...current,
        flashDrafts: {
          ...(current.flashDrafts ?? {}),
          [activeCard.id]: {
            text: answer.slice(0, 1_200),
            updatedAt: new Date().toISOString(),
          },
        },
      }));
    }, 700);
    return () => {
      if (draftTimer.current) globalThis.clearTimeout(draftTimer.current);
    };
  }, [activeCard, answer, save, savedDraft]);

  if (!activeCard) {
    return (
      <div className="page">
        <div className="empty-state">
          <Filter size={24} />
          <strong>No cards match these filters</strong>
          <button
            type="button"
            onClick={() => {
              setBranchFilter("all");
              setEvidenceFilter("all");
              setQuery("");
              setSearchParams({});
            }}
          >
            Reset filters
          </button>
        </div>
      </div>
    );
  }

  const card = activeCard;
  const cardAttempts = (state.flashAttempts ?? [])
    .filter((attempt) => attempt.cardId === card.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;

  function selectCard(cardId: string) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("card", cardId);
      if (branchFilter === "all") next.delete("branch");
      else next.set("branch", branchFilter);
      return next;
    });
  }

  function nextCard() {
    const next = filtered[(activeIndex + 1) % filtered.length];
    if (next) selectCard(next.id);
  }

  function nextPriorityCard() {
    const remaining = filtered.filter((candidate) => candidate.id !== card.id);
    const unvalidated = remaining.find((candidate) => !latest.has(candidate.id));
    const weakest = [...remaining]
      .filter((candidate) => latest.has(candidate.id))
      .sort(
        (left, right) =>
          (latest.get(left.id)?.score ?? 101) - (latest.get(right.id)?.score ?? 101),
      )[0];
    const next = unvalidated ?? weakest ?? remaining[0];
    if (next) selectCard(next.id);
  }

  function shuffleCard() {
    const recent = new Set([card.id, ...(state.flashRecent ?? [])]);
    const candidates = filtered.filter((card) => !recent.has(card.id));
    const pool = candidates.length ? candidates : filtered.filter((candidate) => candidate.id !== card.id);
    const next = pool[Math.floor(Math.random() * pool.length)];
    if (!next) return;
    void save((current) => ({
      ...current,
      flashRecent: [card.id, ...(current.flashRecent ?? []).filter((id) => id !== card.id)].slice(0, 6),
    }));
    selectCard(next.id);
  }

  async function validate() {
    setValidationError("");
    try {
      const validation = await apiClient.validateRecall({
        cardId: card.id,
        answer: answer.trim(),
      });
      const createdAt = new Date().toISOString();
      const attempt: FlashAttempt = {
        ...validation,
        id: attemptId(card.id),
        createdAt,
      };
      const rewardKey = `${card.id}:${createdAt.slice(0, 10)}`;
      await save((current) => {
        const claims: string[] = Array.isArray(current.flashRewardClaims)
          ? current.flashRewardClaims
          : [];
        const reward = claims.includes(rewardKey) ? 0 : recallReward(validation.score);
        return {
          ...current,
          uiVersion: 30,
          xp: Number(current.xp ?? 0) + reward,
          flashAttempts: [attempt, ...(current.flashAttempts ?? [])].slice(0, 200),
          selectedFlashAttempt: attempt.id,
          flashActiveId: card.id,
          flashRewardClaims: reward ? [...claims, rewardKey].slice(-1_000) : claims,
        };
      });
      setResult(validation);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : "Recall validation failed.");
    }
  }

  return (
    <div className="page flashcard-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">PRACTICE / WRITTEN RECALL</span>
          <h1>Recall deck</h1>
          <p>{flashcards.length} operations cards with server-authoritative evidence.</p>
        </div>
        <div className="header-counter">
          {filtered.filter((item) => latest.has(item.id)).length} / {filtered.length} EVIDENCED
        </div>
      </header>

      <section className="filter-bar" aria-label="Flashcard filters">
        <label className="filter-search">
          Find a card
          <span>
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 80))}
              placeholder="Sequence, latency, rejects..."
            />
          </span>
        </label>
        <label>
          Branch
          <select
            value={branchFilter}
            onChange={(event) => {
              const branch = event.target.value as BranchId | "all";
              setBranchFilter(branch);
              setSearchParams(branch === "all" ? {} : { branch });
            }}
          >
            <option value="all">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </label>
        <label>
          Evidence
          <select
            value={evidenceFilter}
            onChange={(event) => setEvidenceFilter(event.target.value as EvidenceFilter)}
          >
            <option value="all">All evidence</option>
            <option value="unvalidated">Unvalidated</option>
            <option value="validated">Validated</option>
            <option value="needs-review">Needs review</option>
            <option value="strong">Strong recall</option>
          </select>
        </label>
        <button
          type="button"
          className="button"
          onClick={() => {
            setBranchFilter("all");
            setEvidenceFilter("all");
            setQuery("");
            setSearchParams({});
          }}
        >
          <RefreshCw size={16} /> Reset
        </button>
      </section>

      <div className="recall-layout">
        <section className="recall-editor">
          <header>
            <div className="recall-context-row">
              <span
                className="branch-badge"
                style={{ "--branch-color": branchById.get(card.branch)?.color } as CSSProperties}
              >
                {branchById.get(card.branch)?.shortName ?? card.branch}
              </span>
              <span className="card-evidence-status">
                {latest.has(card.id) ? <CheckCircle2 size={13} /> : <CircleDot size={13} />}
                {latest.has(card.id) ? `${latest.get(card.id)?.score}% latest` : "Unvalidated"}
              </span>
              <span>{activeIndex + 1} / {filtered.length}</span>
            </div>
            <h2>{card.prompt}</h2>
            <p>Write the decision and operational evidence you would say aloud.</p>
            <div className="recall-position" aria-label={`Card ${activeIndex + 1} of ${filtered.length}`}>
              <span style={{ width: `${((activeIndex + 1) / filtered.length) * 100}%` }} />
            </div>
          </header>

          <label className="answer-field">
            <span>Your recall</span>
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value.slice(0, 1_200))}
              placeholder="Answer from memory before opening the reference..."
              rows={10}
            />
            <small>
              <span>{words} words</span>
              <span>{answer.length} / 1200</span>
              <span><Save size={13} /> {isSaving ? "Saving" : "Draft synchronized"}</span>
            </small>
          </label>

          {validationError ? <div className="inline-error" role="alert">{validationError}</div> : null}

          {result ? (
            <section className="validation-result" aria-live="polite">
              <div className="validation-score">
                <span className="status-label" data-tone={result.score >= 80 ? "healthy" : "warning"}>
                  {result.verdict.toUpperCase()}
                </span>
                <strong>{result.score}%</strong>
                <small>rubric v{result.rubricVersion}</small>
              </div>
              <div className="score-components">
                <div><span>Concept coverage</span><strong>{result.coverageScore} / 60</strong></div>
                <div><span>Answer structure</span><strong>{result.structureScore} / 25</strong></div>
                <div><span>Operational detail</span><strong>{result.specificityScore} / 15</strong></div>
              </div>
              <div className="concept-columns">
                <div>
                  <strong>Detected</strong>
                  {result.matched.map((item) => <span key={item}><CheckCircle2 size={14} /> {item}</span>)}
                </div>
                <div>
                  <strong>Strengthen</strong>
                  {result.missing.map((item) => <span key={item}>{item}</span>)}
                </div>
              </div>
              <div className="validation-next-actions">
                <span>Evidence recorded. Strengthen missing concepts or continue the filtered run.</span>
                <Link className="button" to={`/learn/${card.branch}`}>
                  <BookOpenCheck size={16} /> Review guide
                </Link>
                <button type="button" className="button button-primary" onClick={nextPriorityCard}>
                  Next priority <ArrowRight size={16} />
                </button>
              </div>
            </section>
          ) : null}

          {revealed ? (
            <section className="reference-panel">
              <span className="eyebrow">SEALED REFERENCE</span>
              <p>{card.answer}</p>
              <small>{card.deepDive}</small>
            </section>
          ) : null}

          <footer className="recall-actions">
            <button
              type="button"
              className="button button-primary"
              disabled={answer.trim().length < 20 || isSaving}
              onClick={() => void validate()}
            >
              <CheckCircle2 size={17} />
              {result ? "Validate revision" : "Validate response"}
            </button>
            <button
              type="button"
              className="button"
              disabled={answer.trim().length < 20}
              onClick={() => setRevealed(true)}
            >
              <Eye size={17} /> Reveal reference
            </button>
            <span />
            <button type="button" className="button" onClick={shuffleCard}>
              <Shuffle size={17} /> Shuffle
            </button>
            <button type="button" className="button" onClick={nextCard}>
              Next <ArrowRight size={17} />
            </button>
          </footer>
        </section>

        <aside className="attempt-panel">
          <section className="recall-branch-context">
            <span
              className="branch-badge"
              style={{ "--branch-color": branchById.get(card.branch)?.color } as CSSProperties}
            >
              {branchById.get(card.branch)?.name ?? card.branch}
            </span>
            <p>{branchById.get(card.branch)?.description}</p>
            <Link to={`/learn/${card.branch}`}>
              <BookOpenCheck size={15} /> Open deep dive <ArrowRight size={14} />
            </Link>
          </section>
          <div className="section-heading">
            <div>
              <span className="eyebrow">EVIDENCE</span>
              <h2>Attempt history</h2>
            </div>
            <span>{cardAttempts.length}</span>
          </div>
          {cardAttempts.length ? (
            <ol>
              {cardAttempts.map((attempt) => (
                <li key={attempt.id}>
                  <strong>{attempt.score}%</strong>
                  <span>{attempt.verdict}</span>
                  <small>{new Date(attempt.createdAt).toLocaleString()} · {attempt.wordCount} words</small>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-evidence">
              <strong>No validated evidence</strong>
              <span>Your draft is private until you validate it.</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
