# PostgreSQL migrations

Forward-only PostgreSQL schema migrations are applied in lexical order.

The application checks `getops_schema_migrations` during readiness. Local
containers mount this directory into PostgreSQL's initialization directory;
existing environments apply new files with `scripts/migrate.sh`.
