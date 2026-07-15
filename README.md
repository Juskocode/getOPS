# getOPS

Trading Ops Ascent: an interactive preparation system for quantitative trading and HFT operations roles.

## Included

- A verified eight-stage learning path with 27 mastery nodes, seven scored prerequisite checkpoints, seven pressure gates, zoom, search, and a separate branch map.
- An evidence-driven Shift Plan on Today with 30, 60, 90, or 120-minute budgets and Focused, Balanced, or Pressure load profiles. It explains why each block was selected, includes path checkpoints and bosses as first-class work, deep-links into the exact exercise, and marks a block complete only when linked persisted evidence changes. Skip, restore, reload, day rollover, rebuild archive, Campaign history, and concurrent-tab merge are all stateful; creating a plan awards no XP.
- Eight evolving operations scenarios with timed replay, selectable incident snapshots, gated command windows, simulated dashboards, evidence selection, and incident dispatch writing. Every command now produces a contained or escalated telemetry aftershock, then requires a separate recovery decision, evidence pack, handoff, and 60/40 composite gate before the full answer guide unlocks. Completed attempts retain bounded command/recovery component scores, selected evidence, communication gaps, rationale, and written records for replay.
- A persistent Telemetry Triage Arena with seven deterministic case families spanning stale downstream data, sequence reconstruction, reject amplification, risk-limit epochs, clock domains, opening capacity, and volatility halts. Every seed changes abstract identifiers and telemetry while preserving the control invariant. A run requires severity, scope, immediate control, evidence, and dispatch; passes need at least 75% plus exact severity and control. Weakest-dimension repair launches exactly ten linked questions, while history, drafts, profile evidence, readiness, achievements, and Shift Plan completion survive reload and concurrent merge.
- A persistent Shift Desk with two complete European trading-day simulations. Each run joins pre-open readiness, opening capacity or auction control, live order/data integrity, and post-close reconciliation through explicit decision, evidence, audit-record, review, and advance gates. A shift passes at an 80% average only when no critical phase falls below 70%; the weakest phase generates a deterministic ten-question repair queue.
- A persistent Interview Studio with 24 positioning, behavioral, technical-operations, and submitted-task-defense prompts across Core, Hard, and HFT pressure levels. It autosaves transcripts, scores six prompt-specific evidence dimensions plus delivery, withholds model answers until explicit submission, preserves bounded rehearsal history, selects adaptive next prompts, and turns held dimensions into a ten-question repair queue. Today and the operator profile expose the latest rehearsal, transcript history, strongest score, and weakest dimension.
- Sixteen auto-evaluated drills covering timestamps, sequence recovery, latency, capacity, alert design, order states, session control, position reconciliation, audit records, and dashboard semantics.
- A 500-question bank with four or five plausible choices per question, five animated levels from Tutorial through HFT, format labels and filtering, multi-attempt elimination without early answer leakage, clean-versus-recovered scoring, selected-choice analysis, every-option explanations, evidence packs, runbooks, spoken answers, 54 operational diagrams, filter-aware random selection, bookmarks, scored queues, and custom playlists.
- A five-point question-evidence model that separates unseen, repair, learning, mastered, and durable states. Clean proof can advance only once per calendar day, mastery requires three evidence points, durable proof requires five points plus two delayed retention passes, and same-day replay cannot farm evidence, XP, or review-stage distance.
- An auditable Practice Ledger that keeps up to 100 completed runs with stable IDs, exact question order, per-question outcome and calibration, selection reason, duration, XP, branch, and evidence movement. Any run can be replayed in its original order, while repair launches only unresolved or overconfident decisions and links the follow-up back to its source. Score-only legacy runs remain visible without pretending that their missing question identity can be reconstructed.
- One hundred fifty written-recall flashcards with persistent drafts, deterministic concept/structure/specificity validation, explicit reference reveal, revision history, evidence filters, no-repeat shuffle, bounded XP, profile analytics, and API-validated state. Question review also includes explicit spaced-review stages from same-day recovery through 60-day retention, a prioritized review inbox, pre-answer confidence calibration, an adaptive daily run, and a 12-session campaign.
- Twenty deep operator guides with mental models, signals, runbooks, common traps, spoken answers, linked drills, and primary references.
- A simplified five-section workspace: Today, Learn, Practice, Simulate, and Progress, with contextual secondary navigation.
- A Progress dashboard with rank progression, 52-week activity, domain coverage, recent work, thirty-three achievements, telemetry-triage, interview, and full-shift audit evidence, and an incident replay center with a 12-run trend, per-scenario attempt comparison, five-stage evidence trail, normalized decision/evidence/communication diagnostics, closed-loop repair cycles, and delayed transfer-retention evidence.
- An inspectable 100-point readiness console with ten independently weighted lanes: command path, question-bank evidence, incident pressure, telemetry triage, operational drills, interview transfer, full-shift control, operator guides, recall durability, and sample-confidence-adjusted decision quality. Every lane exposes its evidence and routes directly to corrective practice.
- Fifteen named ranks, per-answer XP, combo bonuses, daily quests, streaks, score history, node notes, and SQLite persistence.
- A motion layer with hydration and page skeletons, view-entry transitions, animated level-label glints, multi-shape answer/rank/achievement particles, XP popups, combo celebrations, reward reveals, three tunable Web Audio profiles with volume control, and reduced-motion support.
- A focused lesson workspace that replaces the tree after node selection, with a gate question, an explicit user-controlled explanation handoff, queued tutorial steps, notes, keyboard escape, and optional synthesized sound feedback.
- A distraction-reduced question focus mode plus a persisted operator profile with editable identity, rank and XP, readiness, level mastery, domain coverage, milestones, and recent evidence.
- A daily five-tier Shift Pass, claimable XP caches, momentum states, a compact focus HUD, a rank emblem, an operator badge shelf, and persisted reward history.
- An adaptive Command Queue that prioritizes due work, active repair, durability gaps, weak-domain coverage, unseen questions, and depth progression while strongly suppressing recently attempted and same-day-evidence items.
- A targeted Calibration Lab that measures certainty before each decision, identifies high-confidence misses and low-confidence clean solves, infers likely misconception signals from eliminated near misses, and turns those patterns into runnable queues from the operator profile.
- A persistent run trail and end-of-run domain debrief that distinguish clean, recovered, elimination-revealed, and skipped outcomes instead of flattening every completion into a pass.
- Context-aware navigation keeps path quizzes attached to the learning path, makes active section tabs return to their section root, preserves quiz contents on restart, and exposes filter-aware shuffle after every answered question. Shuffle draws only from questions that have not been answered or skipped and clearly disables itself when that filtered pool is exhausted.
- Incident repair queues retain their replay context throughout answering, debrief, rerun, and review navigation. A passing repair queue arms a clean same-scenario transfer test, resets prior answer state, and records whether the incident gate, composite stability, and targeted command improvement hold under pressure.
- Every verified transfer enters a persisted `1d → 7d → 21d → 60d` retention ladder. Each no-carryover check records its due date, reference run, adaptive composite and target floors, linked result, score deltas, and terminal verdict. A lapse routes the exact failed run into a new repair queue; a 60-day pass becomes a durable transfer proof.

## Run

### Local development

```bash
cd "/Users/afreitas/Documents/Quant Trader interview prep/trading-ops-ascent"
npm ci
npm run build
python3 server.py --port 8766
```

Open `http://127.0.0.1:8766/` in a browser. Progress is saved locally in `data/trading_ops_ascent.db`, with browser storage retained as an offline fallback. Earlier browser progress is migrated automatically on first load.

### Production-like stack

```bash
cd "/Users/afreitas/Documents/Quant Trader interview prep/trading-ops-ascent"
cp .env.example .env
./scripts/compose.sh up --build -d
./scripts/smoke-production.sh
```

This starts an Nginx edge on `127.0.0.1:8766` and a private Gunicorn origin. Nginx serves compressed content-addressed assets with immutable caching, bypasses cache for the API, applies request limits and security headers, and forwards request IDs. The browser service worker caches only the application shell and never caches progress APIs. See [docs/production-flow.md](docs/production-flow.md) for the request, cache, save-conflict, backup, and deployment flow.

Recommended first sequence:

1. Open `Today`, choose the time you really have, and build a Focused, Balanced, or Pressure Shift Plan.
2. Run the blocks in order; use each block's reason and evidence label to understand why it is in the queue.
3. Return through `Shift plan` after linked work and confirm that the block changes to `PROVED` only after its evidence is persisted.
4. Inspect the Shift-plan ledger under `Progress > Campaign`, then use branch readiness and the twelve-session boss path for the next longer cycle.

## Source Notes

See [docs/architecture.md](docs/architecture.md) for the repository map, runtime boundaries, and change discipline. The written retrieval workflow, rubric, persistence contract, and extension rules live in [docs/typed-recall.md](docs/typed-recall.md).

- `frontend/source.fragment.html` is the editable visualization source.
- `frontend/base.css` supplies the local design-system styles.
- `frontend/persistence.js` connects the standalone browser app to the API with timeouts, GET retries, ETag revalidation, and revision-safe writes.
- `server.py` contains the WSGI origin, local static server, SQLite store, health checks, online backup, validation, WAL mode, and atomic revision-conflict protection.
- `frontend/build.mjs` extracts the fragment into content-addressed CSS and JavaScript, vendors Lucide, precompresses assets, and generates the app-shell service worker.
- `dist/` is the production static release. `index.html` remains a direct-open convenience document that references the same generated assets.
- `deploy/` contains the Gunicorn and Nginx container definitions and edge policy.
- `docker-compose.yml` runs the restricted edge/origin pair with persistent SQLite storage and bounded logs.
- Training scenarios use abstract systems, thresholds, strategies, and identifiers. Do not add confidential production architecture or customer data.

## Motion Rules

- Keep loading feedback tied to real lifecycle states: initial SQLite hydration or a major workspace transition.
- Keep feedback short and non-blocking. Achievement and rank animations replay once and never loop.
- Preserve `prefers-reduced-motion`; every interaction must remain complete with animation disabled.
- Avoid animations that change layout dimensions after hydration. Verify desktop and mobile widths after motion changes.

## Verification

```bash
cd "/Users/afreitas/Documents/Quant Trader interview prep/trading-ops-ascent"
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
npm test
npm run doctor
./scripts/compose.sh config -q
```

The API exposes `GET /api/health/live`, `GET /api/health/ready`, backward-compatible `GET /api/health`, `GET /api/diagnostics`, `GET /api/state`, `PUT /api/state`, `GET /api/history`, and `GET /api/export` for the local profile. State reads support `ETag`/`If-None-Match`; state writes require both the latest revision and matching `If-Match` when supplied. Concurrent workers are serialized around the revision read/write transaction, and concurrent tabs merge progress instead of silently overwriting newer data.

Practice history is capped at 100 exact or explicitly legacy runs, adaptive Shift Plan history at 30 plans, telemetry-triage history at 100 runs, incident history at 200 runs, closed-loop remediation history at 100 cycles, transfer-retention history at 200 checks, full-shift history at 50 completed trading days, and interview history at 100 rehearsals. The API recomputes practice scores, outcome counters, repair sets, duration, and source-set lineage; it also validates the single active-plan pointer, plan and item IDs, allowed budgets, item types, planned minutes, terminal states, ordered timezone-aware timestamps, triage seeds and mandatory gates, branches, decision indexes, evidence arrays and maps, missing-field labels, text lengths, cycle and review status, transfer deltas, real calendar dates, bounded question counters, mastery evidence, selected-run pointers, shift phase completeness, interview prompt and rubric identity, delivery arithmetic, derived pass state, linked IDs, and terminal-state consistency before committing a state revision. Earlier v20 and older profiles migrate without losing XP or attempt history; score-only practice runs remain visible as legacy summaries, and schemas without distinct evidence dates contribute at most one provisional mastery point.

The included deployment is intentionally single-user. Keep the default loopback bind, or put TLS and authentication at a private tunnel, load balancer, or managed CDN before exposing it outside the host.

## Reference Shelf

- Eqvilent Trading Operations Specialist job description
- ESMA MiFID II Article 17 and the 2026 algorithmic-trading supervisory briefing
- Nasdaq TotalView-ITCH 5.0
- FIX Trading Community order-state-change matrices
- Larry Harris, *Trading and Exchanges*
- Barry Johnson, *Algorithmic Trading & DMA*
- Brendan Gregg, *Systems Performance*
- Google, *Site Reliability Engineering*
