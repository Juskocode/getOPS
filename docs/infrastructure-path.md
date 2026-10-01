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
- Four investigations at `/simulate/infrastructure`, with 16 inspectable
  evidence panels and 12 scored operational decisions.

All modules are accessible. Prerequisites are recommendations, not hidden locks.
Examples are illustrative, not company infrastructure or actual customer data.
No command is executed by the browser. Particularly `strace` can perturb a
latency-sensitive service: the lesson explicitly requires controlled use.

## Persistence and scoring

`infraRead`, `infraAnswers` and `infraLabs` extend the existing versioned profile JSON, stored
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
Completed checkpoints also count toward the daily practice target on the local
calendar day they were completed, including revealed reviews without correctness
credit. Incomplete guesses do not count toward that target.

## Incident workbench

The four investigations cover RX/IRQ hot spots, cgroup CPU throttling, an
edge-triggered socket reader and a blocking audit durability path. Each case
has a synthetic latency timeline, four command/telemetry excerpts, and three
decisions: locate the boundary, select an authorized response, and validate
recovery. Every option has specific feedback and the debrief includes a model
operational handover and primary documentation.

Required evidence must be inspected before a decision. Earlier decisions must
be completed before later ones; a deep link cannot bypass the normal sequence.
The same explicit-next and 15/5/0 XP rules apply. Inspection alone awards no XP.
Reading evidence is recorded as inspection, not proof of understanding.
Rehearsal runs in component-local state and cannot replace saved decisions,
alter their timestamps or add daily practice credit. Ending rehearsal restores
the saved run. Save failures retain the selection for an explicit retry.

Focus mode hides the case library and persists in the URL. Learning-path
search, stage and progress filters also survive reloads. Resume links open the
first unfinished checkpoint; the Needs review filter links to the first guided
or revealed checkpoint. These are self-study records, not verified
professional readiness scores.

## Organization

- `apps/web/src/content/infrastructure/`: typed lesson catalog and trace data.
- `apps/web/src/domain/infrastructure.ts`: deterministic grading and progress.
- `apps/web/src/domain/infrastructure-labs.ts`: investigation sequencing and evidence.
- `apps/web/src/features/infrastructure/`: path, reader, packet explorer and quiz.
- `apps/web/src/styles/infrastructure.css`: scoped responsive reader styles.
- `apps/web/src/styles/investigations.css`: evidence desk, focus and debrief layouts.
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
GETOPS_QA_URL=http://127.0.0.1:5173 node scripts/infrastructure-labs-browser-check.mjs
```

The browser check requires Playwright and Chrome. Set `GETOPS_PLAYWRIGHT_MODULE`
to an installed Playwright module path when it is not installed in the repo.
It uses a unique `infra-qa-*` profile against the real API, leaving the operator's
profile unchanged. It verifies persistence, explicit advancement, failed-save
retry, no rehearsal XP, navigation, responsive overflow and reduced motion.
Screenshots go to ignored `.runtime/qa/`. Test profiles are left identifiable in
the local database; the test never deletes the operator's data.
The investigation check uses its own `labs-qa-*` profile, completes all four
cases, and exercises blocked deep links, evidence gates, failed-save retry,
rehearsal isolation, responsive layout and daily/profile integration.
