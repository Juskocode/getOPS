# Typed recall evidence

The getOPS recall deck is written retrieval, not a reveal-only carousel. React
keeps the learner on the current card until explicit navigation, saves drafts,
and asks the C++ service to score each committed response.

## Learner flow

1. Filter the 150-card catalog by operations branch and evidence state.
2. Write an answer from memory. Drafts save through the revision-safe profile.
3. Select **Validate response**.
4. The C++ API returns concept, structure, and specificity evidence.
5. React persists the exact authoritative result with an attempt ID and time.
6. The C++ API re-scores rubric v2 attempts before accepting the state write.
7. Reveal the reference, revise, navigate, or shuffle only when ready.

Validation never reveals the reference and never advances the card.

## Scoring contract

| Component | Points | Purpose |
| --- | ---: | --- |
| Concept coverage | 60 | Required definitions, distinctions, and controls |
| Answer structure | 25 | A complete operational relationship or decision |
| Operational specificity | 15 | Signals, scope, evidence, and production language |

- `0-59`: `needs-work`, saved with no XP.
- `60-79`: `developing`, eligible for 5 XP.
- `80-100`: `strong`, eligible for 10 XP.
- `75+`: resolved evidence for the operational pass marker.

XP can be claimed once per card and calendar day. The deterministic rubric is a
retrieval aid; the reference answer remains the nuance check.

## Persistence contract

```text
flashDrafts[cardId]
  text, updatedAt

flashAttempts[]
  id, cardId, answer, createdAt, rubricVersion, wordCount
  coverageScore, structureScore, specificityScore, score
  verdict, resolved, matched[], missing[]
```

Attempts are immutable by ID and bounded to 200. The selected attempt must
reference retained evidence. PostgreSQL stores the complete profile document,
while the C++ state validator enforces:

- known card identity and rubric version;
- word and text limits;
- component ranges and arithmetic;
- verdict and resolved-state derivation;
- matched and missing evidence arrays;
- timestamp, ID, history, and pointer bounds;
- exact authoritative replay of every rubric v2 attempt.

Rubric v1 attempts remain importable as historical legacy evidence. They are
shape-validated but cannot pretend to be newly server-scored evidence.

## Concurrency

1. React loads a profile revision and ETag.
2. A save sends the numeric revision and `If-Match`.
3. PostgreSQL serializes the profile transaction.
4. A stale writer receives `409 revision_conflict`.
5. React reloads the newer profile and asks the learner to reapply the change.

The first schema deliberately stores the full state as JSONB to preserve legacy
progress. More relational evidence tables can be introduced after each training
contract is ported and stabilized.

## Maintenance

- Edit the catalog in `content/flashcards.json`.
- Keep card IDs stable and prompts unique.
- Keep content abstract and confidentiality-safe.
- Update `packages/contracts`, C++ validation, OpenAPI, and React projections
  together when the attempt schema changes.
- Add a domain test for every scoring or validation invariant.
- Add an HTTP integration assertion when response or error semantics change.

## Release checks

```bash
npm run web:test
npm run api:test
npm run api:test:postgres
npm run api:test:http
```

The release gate verifies that valid recall evidence round trips, a forged rubric
v2 score is rejected, revision conflicts do not overwrite newer state, and an
empty-profile import remains canonical.
