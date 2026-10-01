# Systems and infrastructure learning path

## Scope

The React workspace now contains an eight-module Linux infrastructure path at
`/learn/infrastructure`. It connects NIC receive queues, transport, event-driven
I/O, threading, memory, durable storage and Unix operations to trading-system
freshness, correctness and incident discipline.

- 24 conceptual sections, each with an operational application.
- 16 synthetic diagnostic transcripts with interpretation and safety boundaries.
- 32 multiple-choice checkpoints, each with four options and per-option feedback.
- Eight interview prompts and model answers.
- A six-boundary packet explorer with four synthetic incident states.
- Primary references to Linux kernel documentation and Linux man-pages.

All modules are accessible. Prerequisites are recommendations, not hidden locks.
Examples are illustrative, not company infrastructure or actual customer data.
No command is executed by the browser. Particularly `strace` can perturb a
latency-sensitive service: the lesson explicitly requires controlled use.

## Persistence and scoring

`infraRead` and `infraAnswers` extend the existing versioned profile JSON, stored
through the C++ API in PostgreSQL. No database migration is required. Existing
trading flashcards and their server rubric remain unchanged.

Both TypeScript contracts and C++ validate module/question IDs, bounded unique
option indices, and timestamp shape. The client computes self-study feedback:
this is not a proctored or server-authoritative examination, and clients can
inspect the bundled answer key. XP is a personal practice incentive, not an
anti-cheat or certification guarantee.

A wrong selection is persisted without revealing the correct option. After a
correct answer or three distinct wrong selections, the answer guide appears.
The learner must explicitly choose the next checkpoint. First-try correct gives
15 XP, guided correct gives 5 XP, and an exhausted answer gives 0 XP. A completed
checkpoint cannot award again during normal retries or duplicate submissions.
Rehearsal is local to the open question and never replaces the first saved
evidence or adds XP. The overview distinguishes first-try, guided, and revealed
results; reviewed does not mean mastered. Failed writes keep the current
selection available for retry.

## Organization

- `apps/web/src/content/infrastructure/`: typed lesson catalog and trace data.
- `apps/web/src/domain/infrastructure.ts`: deterministic grading and progress.
- `apps/web/src/features/infrastructure/`: path, reader, packet explorer and quiz.
- `apps/web/src/styles/infrastructure.css`: scoped responsive reader styles.
- `packages/contracts/src/index.ts`: shared progress contracts.
- `services/api/src/state_validator.cpp`: server-side shape validation.

Infrastructure is linked from Learn, Today, Progress and global search. The
public Galton route remains independent; private study state is not newly
exposed by this change.

## Verification

```sh
npm run web:test
npm run web:build
npm run api:test
GETOPS_API_ORIGIN=http://127.0.0.1:8766 npm run web:dev
GETOPS_QA_URL=http://127.0.0.1:5173 node scripts/infrastructure-browser-check.mjs
```

The browser check requires Playwright and Chrome. Set `GETOPS_PLAYWRIGHT_MODULE`
to an installed Playwright module path when it is not installed in the repo.
It uses a unique `infra-qa-*` profile against the real API, leaving the operator's
profile unchanged. It verifies persistence, explicit advancement, failed-save
retry, no rehearsal XP, navigation, responsive overflow and reduced motion.
Screenshots go to ignored `.runtime/qa/`. Test profiles are left identifiable in
the local database; the test never deletes the operator's data.
