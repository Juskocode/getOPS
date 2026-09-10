#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
CONTAINER_NAME="getops-api-postgres-it-$$"
POSTGRES_IMAGE=${POSTGRES_IMAGE:-postgres:17-alpine}
API_LOG=$(mktemp "${TMPDIR:-/tmp}/getops-api.XXXXXX")
API_PID=""

cleanup() {
  status=$?
  trap - EXIT INT TERM
  if [ "$status" -ne 0 ] && [ -s "$API_LOG" ]; then
    printf '\nC++ API log after smoke failure:\n' >&2
    cat "$API_LOG" >&2
  fi
  if [ -n "$API_PID" ]; then
    kill "$API_PID" >/dev/null 2>&1 || true
    wait "$API_PID" >/dev/null 2>&1 || true
  fi
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -f "$API_LOG" "${BODY_FILE:-}" "${HEADER_FILE:-}"
  exit "$status"
}
trap cleanup EXIT INT TERM

docker run -d --rm \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_USER=getops \
  -e POSTGRES_PASSWORD=getops \
  -e POSTGRES_DB=getops \
  -p 127.0.0.1::5432 \
  -v "$ROOT_DIR/db/migrations:/docker-entrypoint-initdb.d:ro" \
  "$POSTGRES_IMAGE" >/dev/null

attempt=1
while [ "$attempt" -le 60 ]; do
  if docker exec "$CONTAINER_NAME" pg_isready -U getops -d getops >/dev/null 2>&1; then
    break
  fi
  if [ "$attempt" -eq 60 ]; then
    docker logs "$CONTAINER_NAME"
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 1
done

DB_PORT=$(docker port "$CONTAINER_NAME" 5432/tcp | sed -n 's/.*://p' | head -n 1)
API_PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')
BODY_FILE=$(mktemp "${TMPDIR:-/tmp}/getops-body.XXXXXX")
HEADER_FILE=$(mktemp "${TMPDIR:-/tmp}/getops-headers.XXXXXX")

cd "$ROOT_DIR"
npm run api:build

GETOPS_BIND=127.0.0.1 \
GETOPS_PORT="$API_PORT" \
GETOPS_DATABASE_URL="postgresql://getops:getops@127.0.0.1:${DB_PORT}/getops" \
GETOPS_CATALOG_PATH="$ROOT_DIR/content/flashcards.json" \
  "$ROOT_DIR/services/api/build/services/api/getops_api" >"$API_LOG" 2>&1 &
API_PID=$!

attempt=1
while [ "$attempt" -le 60 ]; do
  if curl --silent --fail "http://127.0.0.1:${API_PORT}/api/v1/health/ready" >"$BODY_FILE"; then
    break
  fi
  if ! kill -0 "$API_PID" >/dev/null 2>&1; then
    cat "$API_LOG"
    exit 1
  fi
  if [ "$attempt" -eq 60 ]; then
    cat "$API_LOG"
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 1
done

node -e '
  const fs = require("fs");
  const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (body.status !== "ok" || body.database !== "ready") process.exit(1);
' "$BODY_FILE"

status=$(curl --silent --show-error \
  -D "$HEADER_FILE" \
  -o "$BODY_FILE" \
  -w '%{http_code}' \
  "http://127.0.0.1:${API_PORT}/api/v1/profiles/smoke/state")
[ "$status" = "200" ]
grep -qi '^etag: "state-smoke-r0"' "$HEADER_FILE"
node -e '
  const fs = require("fs");
  const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (body.profile !== "smoke" || body.revision !== 0 || body.state !== null) process.exit(1);
' "$BODY_FILE"

status=$(curl --silent --show-error \
  -D "$HEADER_FILE" \
  -o "$BODY_FILE" \
  -w '%{http_code}' \
  -X PUT \
  -H 'Content-Type: application/json' \
  -H 'If-Match: "state-smoke-r0"' \
  --data '{"revision":0,"state":{"uiVersion":30,"xp":10,"displayName":"Smoke Operator","flashDrafts":{},"flashAttempts":[]}}' \
  "http://127.0.0.1:${API_PORT}/api/v1/profiles/smoke/state")
[ "$status" = "200" ]
grep -qi '^etag: "state-smoke-r1"' "$HEADER_FILE"
node -e '
  const fs = require("fs");
  const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (body.revision !== 1 || body.state.xp !== 10) process.exit(1);
' "$BODY_FILE"

status=$(curl --silent --show-error \
  -o /dev/null \
  -w '%{http_code}' \
  -H 'If-None-Match: "state-smoke-r1"' \
  "http://127.0.0.1:${API_PORT}/api/v1/profiles/smoke/state")
[ "$status" = "304" ]

status=$(curl --silent --show-error \
  -o "$BODY_FILE" \
  -w '%{http_code}' \
  -X PUT \
  -H 'Content-Type: application/json' \
  -H 'If-Match: "state-smoke-r0"' \
  --data '{"revision":0,"state":{"uiVersion":30,"xp":99}}' \
  "http://127.0.0.1:${API_PORT}/api/v1/profiles/smoke/state")
[ "$status" = "409" ]
node -e '
  const fs = require("fs");
  const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (body.error !== "revision_conflict" || body.revision !== 1) process.exit(1);
' "$BODY_FILE"

status=$(curl --silent --show-error \
  -o "$BODY_FILE" \
  -w '%{http_code}' \
  -X POST \
  -H 'Content-Type: application/json' \
  --data '{"cardId":"f01","answer":"A quote shows available buying or selling interest with price and size. A trade is a completed execution at a specific price and quantity."}' \
  "http://127.0.0.1:${API_PORT}/api/v1/recall/validate")
[ "$status" = "200" ]
node -e '
  const fs = require("fs");
  const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (body.rubricVersion !== 2 || body.score < 75 || body.resolved !== true) process.exit(1);
' "$BODY_FILE"

status=$(curl --silent --show-error \
  -o "$BODY_FILE" \
  -w '%{http_code}' \
  -X POST \
  -H 'Content-Type: application/json' \
  --data '{"state":{"uiVersion":30,"xp":25}}' \
  "http://127.0.0.1:${API_PORT}/api/v1/profiles/imported/import")
[ "$status" = "201" ]
status=$(curl --silent --show-error \
  -o "$BODY_FILE" \
  -w '%{http_code}' \
  -X POST \
  -H 'Content-Type: application/json' \
  --data '{"state":{"uiVersion":30,"xp":50}}' \
  "http://127.0.0.1:${API_PORT}/api/v1/profiles/imported/import")
[ "$status" = "409" ]

curl --silent --fail \
  "http://127.0.0.1:${API_PORT}/api/v1/diagnostics" >"$BODY_FILE"
node -e '
  const fs = require("fs");
  const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (!body.ready || body.schemaVersion !== 1 || body.profiles !== 2) process.exit(1);
' "$BODY_FILE"

printf 'C++ HTTP API smoke passed on port %s.\n' "$API_PORT"
