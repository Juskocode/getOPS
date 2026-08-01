# Changelog

All notable getOPS changes are recorded here. This project follows semantic
versioning for the application contract, persistence model, and release process.

## 3.0.0 - Unreleased

### Platform

- Added the React 19 and TypeScript client with explicit Today, Learn, written
  recall, Simulate, and Profile routes.
- Added a C++20 API with separated domain, HTTP, and libpq repository layers.
- Added PostgreSQL JSONB profile state, monotonic revisions, bounded history,
  advisory locking for first writers, and forward-only migrations.
- Added shared Zod contracts, versioned curriculum content, OpenAPI, and
  compatibility aliases for the legacy state transport.

### Integrity

- Moved written-recall scoring to the C++ service and re-score rubric v2 evidence
  before accepting a durable state revision.
- Added real PostgreSQL conflict, concurrent writer, import/export, and
  socket-level API integration gates.

### Training Experience

- Rebuilt Learn as a five-stage command path with nine branch-level deep dives,
  signal paths, operator runbooks, failure comparisons, and interview checks.
- Added a native scenario desk with six telemetry briefings spanning market
  data, sessions, capacity, order state, and risk-control incidents.
- Added branch-aware recall search and evidence filters, explicit review and
  next actions, operator grades, readiness cues, and responsive mobile
  navigation.
- Moved browser routing to the patched React Router 8.3 package.

### Deployment

- Added a four-service PostgreSQL, migration, C++ API, and Nginx Compose stack.
- Moved the specialist fallback to `/legacy/` and isolated its service worker.
- Added custom-format PostgreSQL backup, canonical legacy import verification,
  and an isolated QA deployment pattern.

## 2.0.0 - 2026-07-15

### Written Recall

- Added 150 HFT and trading-operations flashcards across market data, order
  lifecycle, latency, connectivity, capacity, incident command, controls, and
  auditability.
- Added persistent free-text drafts and an explicit Validate action. Validation
  scores concept coverage, response structure, and operational specificity with
  a transparent deterministic rubric.
- Kept reference answers hidden until the learner explicitly reveals them.
  Validation never advances the card or turns recall into answer recognition.
- Added bounded per-card daily XP, revision history, evidence-state filtering,
  keyboard controls, no-repeat shuffle, and explicit next-card navigation.
- Integrated written evidence into Today, readiness, achievements, and the
  operator profile.

### Training System

- Expanded the evidence-driven learning path, question bank, operator guides,
  telemetry triage, incident labs, Shift Desk, Interview Studio, calibration,
  repair queues, transfer tests, and delayed retention ladder.
- Added accessible focus modes, responsive layouts, reduced-motion behavior,
  sound profiles, reward feedback, and non-blocking particle effects.

### Persistence And Integrity

- Added strict API validation for flashcard attempts, drafts, scores, timestamps,
  rubric dimensions, card identity, and bounded history.
- Added revision-safe SQLite writes, ETag support, concurrent-tab merge rules,
  online backups, diagnostics, and state export.
- Protected runtime databases, backups, dependencies, and generated releases
  from source control.

### Engineering

- Split editable frontend source, design-system CSS, persistence transport, and
  release builder into explicit repository boundaries.
- Added 41 frontend/build contracts and 22 backend/persistence contracts.
- Added a one-command repository doctor and push/pull-request CI verification.
- Documented architecture, production flow, written-recall scoring, tests, and
  frontend change discipline.
