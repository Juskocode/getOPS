# PostgreSQL migrations

Forward-only PostgreSQL schema migrations are applied in lexical order.

The application checks `getops_schema_migrations` during readiness. Compose
mounts this directory read-only into the one-shot `migrate` service, which
applies every file idempotently. Existing environments apply new files with
`scripts/migrate.sh`.
