# getOPS

[![Verify](https://github.com/Juskocode/getOPS/actions/workflows/verify.yml/badge.svg)](https://github.com/Juskocode/getOPS/actions/workflows/verify.yml)

getOPS is an interactive HFT and trading-operations training workspace. The
current application is a client-server system with a React and TypeScript
client, a C++20 API, and PostgreSQL revision storage.

## Architecture

```mermaid
flowchart LR
    Browser["React + TypeScript client"] -->|HTML and immutable assets| Edge["Nginx"]
    Browser -->|JSON, ETag, request ID| API["C++20 API"]
    API -->|validated transaction| DB[("PostgreSQL")]
    Edge -->|temporary fallback| Legacy["Legacy specialist workspace"]
    Export["Legacy JSON export"] -->|empty-profile import| API
```

The primary application owns Today, the staged learning path, nine operator
deep dives, written recall, six native telemetry briefings, and the operator
profile. The scored pressure engine, broader question bank, Shift Desk,
Interview Studio, repair cycles, and retention ladders remain available at
`/legacy/` while their contracts are ported. New product work belongs in React
or C++; the fallback is a migration source, not a second implementation target.

## Repository Map

```text
apps/web/                 React 19 and TypeScript browser client
services/api/             C++20 HTTP, domain validation, and libpq repository
packages/contracts/       Shared TypeScript transport and state contracts
content/                  Versioned, confidentiality-safe curriculum data
db/migrations/            Forward-only PostgreSQL migrations
deploy/                   Current API and edge container definitions
scripts/                  Build, smoke, migration, backup, and release gates
docs/                     Architecture, API, and operational contracts
legacy/                   Transitional browser and Python/SQLite source
```

The server is authoritative for durable recall evidence. It re-scores rubric v2
attempts before accepting a state revision, verifies revision ownership inside a
PostgreSQL transaction, and records bounded state history. The browser owns
navigation and drafts, but cannot grant itself durable score evidence.

## Run The Stack

```bash
cd "/Users/afreitas/Documents/Quant Trader interview prep/trading-ops-ascent"
cp .env.example .env
./scripts/compose.sh up --build -d
./scripts/smoke-production.sh
```

Open `http://127.0.0.1:8766/`. The default bind is loopback-only. The stack
contains:

- `edge`: Nginx serving the React release and `/legacy/`.
- `api`: the non-root C++ service on the private Compose network.
- `db`: PostgreSQL with a named volume and loopback-only maintenance port.
- `migrate`: a one-shot forward migration job.

Use a different port and project name for an isolated rehearsal:

```bash
COMPOSE_PROJECT_NAME=getops-refactor-qa \
OPS_PORT=8768 \
GETOPS_DB_PORT=55438 \
  ./scripts/compose.sh up --build -d

./scripts/smoke-production.sh http://127.0.0.1:8768
```

## Local Development

For password-protected remote access to the running stack, use
`npm run preview:start`. See [Private Cloudflare Preview](docs/private-preview.md)
for credentials, verification, and shutdown.

Install dependencies and start PostgreSQL:

```bash
npm ci
./scripts/compose.sh up -d db migrate
npm run api:build
```

Run the C++ service:

```bash
GETOPS_DATABASE_URL="postgresql://getops:getops-local-only@127.0.0.1:55432/getops" \
GETOPS_CATALOG_PATH="$PWD/content/flashcards.json" \
  services/api/build/services/api/getops_api
```

In a second terminal, start Vite:

```bash
npm run web:dev
```

Open `http://127.0.0.1:5173/`. Vite proxies `/api` to
`http://127.0.0.1:8780`.

## Migrate Existing Progress

The import endpoint writes only to an empty PostgreSQL profile. It never mutates
the SQLite source.

```bash
npm run legacy:import -- \
  http://127.0.0.1:8766 \
  http://127.0.0.1:8768 \
  local
```

The script exports the legacy profile, imports only its state document, reloads
the PostgreSQL profile, and compares canonical JSON before reporting success.

## Verification

```bash
npm test
npm run web:build
npm run api:test:postgres
npm run api:test:http
npm run doctor
npm run verify:release
./scripts/compose.sh config -q
```

`api:test:postgres` verifies real PostgreSQL save, conflict, import, export, and
concurrent-writer behavior. `api:test:http` starts the C++ binary against a
disposable database and verifies the socket-level API. `verify:release` combines
the repository doctor with both integration gates.

## Operations

```bash
./scripts/compose.sh ps
./scripts/compose.sh logs -f api edge db
./scripts/backup.sh
./scripts/migrate.sh
./scripts/compose.sh down
```

Backups are PostgreSQL custom archives written outside Git. Keep the default
loopback bind, or add TLS and authentication at a private ingress before
exposing the service beyond the host.

## API

The versioned API is documented in [docs/api/openapi.yaml](docs/api/openapi.yaml).
Core endpoints:

- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`
- `GET /api/v1/diagnostics`
- `GET /api/v1/catalog/flashcards`
- `GET|PUT /api/v1/profiles/{profile}/state`
- `GET /api/v1/profiles/{profile}/export`
- `POST /api/v1/profiles/{profile}/import`
- `POST /api/v1/recall/validate`

Compatibility aliases for `/api/state`, `/api/export`, and the legacy health
paths remain during migration.

## Documentation

- [Architecture](docs/architecture.md)
- [Production flow](docs/production-flow.md)
- [Typed recall contract](docs/typed-recall.md)
- [Migration roadmap](docs/migration-roadmap.md)
- [ADR 0001](docs/adr/0001-client-server-migration.md)
- [C++ API](services/api/README.md)

Training content must remain abstract. Do not add confidential architecture,
thresholds, strategy identifiers, customer data, or production incidents.
