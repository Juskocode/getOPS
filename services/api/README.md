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
