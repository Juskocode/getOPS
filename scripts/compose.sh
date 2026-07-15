#!/usr/bin/env sh
set -eu

if docker compose version >/dev/null 2>&1; then
  exec docker compose "$@"
fi
if command -v docker-compose >/dev/null 2>&1; then
  exec docker-compose "$@"
fi

printf 'Docker Compose is not installed.\n' >&2
exit 127
