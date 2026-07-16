# Runtime infrastructure

Current runtime definitions live in `deploy/` and `docker-compose.yml`.

```text
deploy/api.Dockerfile     Multi-stage C++ build and non-root runtime
deploy/edge.Dockerfile    React and legacy static build plus Nginx runtime
deploy/nginx-main.conf    Process, worker, and log policy
deploy/nginx.conf         Static cache, API proxy, limits, and security headers
docker-compose.yml        PostgreSQL, migration, API, and edge topology
```

The old Python image is retained under `legacy/deploy/` and is not part of the
current stack.

## Isolation

Use unique project, edge port, and database port values for a rehearsal:

```bash
COMPOSE_PROJECT_NAME=getops-refactor-qa \
OPS_PORT=8768 \
GETOPS_DB_PORT=55438 \
  ./scripts/compose.sh up --build -d
```

This prevents a migration test from replacing the existing loopback release or
opening its database volume.

## Health and smoke

```bash
./scripts/compose.sh ps
./scripts/smoke-production.sh http://127.0.0.1:8768
./scripts/compose.sh logs -f api edge db
```

The smoke gate checks the React shell, immutable assets, C++ liveness and
readiness, PostgreSQL diagnostics, ETag revalidation, and the `/legacy/`
fallback.

## Persistence

PostgreSQL data lives in the Compose named volume. `scripts/backup.sh` writes a
custom `pg_dump` archive to the ignored `backups/` directory.

Migrations are forward-only:

```bash
./scripts/migrate.sh
```

Never commit `.env`, a database volume, export, backup, or generated release.
