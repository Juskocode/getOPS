# Client-server migration roadmap

This roadmap tracks the transition from the local-first prototype to the
React/C++/PostgreSQL architecture defined in
[ADR 0001](adr/0001-client-server-migration.md).

## Phase 1: Platform foundation

- [ ] Establish npm workspaces and explicit application/service boundaries.
- [ ] Move the current browser and Python implementation under `legacy/`.
- [ ] Add shared TypeScript contracts and versioned curriculum content.
- [ ] Add React routing, error boundaries, loading states, and typed transport.
- [ ] Add C++ configuration, HTTP routing, domain validation, and PostgreSQL RAII.
- [ ] Add PostgreSQL migrations and revision-safe state transactions.
- [ ] Add one-command local stack and health verification.

Exit evidence:

- React assets build without the legacy builder.
- C++ unit tests and compiler warnings pass.
- PostgreSQL integration save, conflict, export, and import paths pass.
- Existing state export imports into an empty PostgreSQL profile without changing
  its canonical JSON.

## Phase 2: Core training parity

- [ ] Today command center.
- [ ] Learning branch overview and progress.
- [ ] Written recall with server-authoritative scoring.
- [ ] Operator profile and typed-recall evidence.
- [ ] Question-bank run, elimination, explanation, and review.

Exit evidence:

- Core profile metrics match the legacy client for the same imported state.
- A written response remains on the same card until explicit navigation.
- Concurrent tabs produce a conflict and recover without lost evidence.

## Phase 3: Pressure systems

- [ ] Auto drills.
- [ ] Telemetry triage.
- [ ] Incident labs and remediation cycles.
- [ ] Shift Desk.
- [ ] Interview Studio.
- [ ] Transfer-retention ladder.

Exit evidence:

- Each subsystem has a typed API contract, durable history, and deterministic
  replay fixture.
- Scoring is performed or verified by the API.

## Phase 4: Legacy retirement

- [ ] Run browser parity at desktop and mobile breakpoints.
- [ ] Rehearse PostgreSQL backup and restore.
- [ ] Rehearse rollback to the last legacy release using the same exported state.
- [ ] Remove `/legacy/` and Python runtime from the production image.
- [ ] Archive migration-only adapters after the support window.

The legacy route is a migration control, not a second permanent product.
