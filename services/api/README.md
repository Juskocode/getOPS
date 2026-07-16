# `getops-api`

C++20 domain and HTTP service for getOPS. It owns catalog validation,
authoritative written-recall scoring, profile-state validation, optimistic
concurrency, and PostgreSQL persistence.

```bash
cmake -S . -B services/api/build -DBUILD_TESTING=ON
cmake --build services/api/build --parallel
ctest --test-dir services/api/build --output-on-failure
```

The service is deliberately layered:

- `getops_domain` has no HTTP or database dependency.
- repository code owns PostgreSQL transactions and revision conflicts.
- HTTP handlers translate transport input into domain calls.

Runtime configuration:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GETOPS_BIND` | `127.0.0.1` | HTTP bind address |
| `GETOPS_PORT` | `8780` | HTTP port |
| `GETOPS_WORKERS` | `8` | bounded request worker count |
| `GETOPS_DATABASE_URL` | required | libpq connection string |
| `GETOPS_CATALOG_PATH` | `content/flashcards.json` | versioned curriculum path |

Run `npm run api:test:http` for a disposable PostgreSQL and socket-level API
test.
