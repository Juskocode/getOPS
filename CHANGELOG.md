# Changelog

All notable getOPS changes are recorded here. This project follows semantic
versioning for the application contract, persistence model, and release process.

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
