# Typed recall evidence

The getOPS flashcard deck is a written retrieval system, not a reveal-only card carousel. It keeps the learner on the current card until they explicitly navigate, saves drafts by card, validates a committed response, and preserves every revision as inspectable evidence.

## Learner flow

1. Filter the 150-card deck by operations branch and evidence state.
2. Write the answer from memory. Drafts autosave locally and to SQLite after hydration.
3. Select **Validate response** or use `Ctrl+Enter` / `Cmd+Enter`.
4. Inspect concept coverage, answer structure, operational specificity, detected concepts, and missing concepts.
5. Revise and validate again, or explicitly reveal the reference answer.
6. Use **Next** or **Shuffle** when ready. Validation never advances or reveals automatically.

Shuffle stays inside the active filters, avoids the current card, suppresses recently seen cards, and prefers cards whose latest evidence is below 80 percent. An active card remains pinned if validation changes whether it matches an evidence filter.

## Scoring contract

The validator is deterministic and intentionally transparent:

| Component | Points | Purpose |
| --- | ---: | --- |
| Concept coverage | 60 | Detect required definitions, distinctions, controls, and evidence groups. |
| Answer structure | 25 | Reward a complete relationship or decision rather than a keyword list. |
| Operational specificity | 15 | Detect branch vocabulary and production checks, scope, controls, or evidence. |

Scores below 60 are `needs-work`, scores from 60 through 79 are `developing`, and scores from 80 are `strong`. The operational pass marker is 75 percent. The score is a retrieval aid, not semantic proof: the UI states that it is a deterministic keyword-and-structure check and keeps the reference available for nuance review.

Critical cards use hand-authored concept groups. Every other card receives a bounded fallback rubric derived from its reference answer and deeper note. Add an override when synonyms, protocol language, or a safety-critical distinction makes fallback matching too ambiguous.

## Persistence model

```text
flashDrafts[cardId]
  text, updatedAt

flashAttempts[]
  id, cardId, answer, createdAt, rubricVersion, wordCount
  coverageScore, structureScore, specificityScore, score
  verdict, resolved, matched[], missing[]
```

Drafts merge by `updatedAt`. Attempts merge by immutable ID, are sorted by creation time, and are capped at 200. The selected attempt must reference a retained attempt. The API recomputes and validates component totals, verdict, pass state, word count, timestamps, label sets, IDs, limits, and references before a revision can be committed.

Typed validation and manual retention grading share one card-and-day award key. A developing response can earn 5 XP and a strong response 10 XP, at most once for that card that day. Weak evidence is saved but earns no XP. Repeated validation can improve the audit trail without farming rewards.

## Maintenance

- Add cards only in `frontend/source.fragment.html` using the next stable `fNNN` identifier.
- Keep content abstract and confidentiality-safe. Never include internal system names, customer details, proprietary thresholds, or incident data.
- Update `FLASH_CARD_PATTERN` and the draft bound in `server.py` when expanding the deck ID range.
- Add a hand-authored rubric override for safety-critical definitions and distinctions.
- Extend frontend contracts for deck count and interaction behavior.
- Extend backend mutation tests whenever the persisted attempt schema changes.
- Run `npm test` and `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v` before deployment.

## Release checks

Use an isolated database copied with SQLite online backup. Confirm a draft survives reload, a validation does not reveal or advance, an old attempt can be selected, a filtered shuffle avoids the current card, a forged score receives HTTP 400, and a concurrent revision conflict merges rather than discarding either attempt.
