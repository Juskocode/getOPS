#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

printf '\n==> Repository contracts\n'
npm run doctor

printf '\n==> PostgreSQL repository integration\n'
npm run api:test:postgres

printf '\n==> C++ HTTP integration\n'
npm run api:test:http

printf '\ngetOPS release verification passed.\n'
