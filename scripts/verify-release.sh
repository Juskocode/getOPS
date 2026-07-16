#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

for command_name in curl node npm python3; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  }
done

printf '\n==> Repository contracts\n'
npm run doctor

TMP_DIR="$(mktemp -d)"
PORT="${PORT:-$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')}"
BASE_URL="http://127.0.0.1:$PORT"
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

cat > "$TMP_DIR/valid.json" <<'JSON'
{
  "profile": "local",
  "revision": 0,
  "state": {
    "uiVersion": 22,
    "xp": 42,
    "flashDrafts": {
      "f10": {
        "text": "Delayed data progresses intentionally while stale data stops unexpectedly.",
        "updatedAt": "2026-07-15T17:00:01.000Z"
      }
    },
    "flashAttempts": [
      {
        "id": "flash-attempt-f10-release-proof",
        "cardId": "f10",
        "answer": "Delayed data progresses intentionally while stale data stops unexpectedly.",
        "createdAt": "2026-07-15T17:00:00.000Z",
        "rubricVersion": 1,
        "wordCount": 9,
        "coverageScore": 45,
        "structureScore": 20,
        "specificityScore": 10,
        "score": 75,
        "verdict": "developing",
        "resolved": true,
        "matched": ["Delay is intentional", "Delayed data still progresses"],
        "missing": ["Staleness is unexpected"]
      }
    ],
    "selectedFlashAttempt": "flash-attempt-f10-release-proof",
    "flashFilter": "feed",
    "flashStatus": "needs-review",
    "flashActiveId": "f10",
    "flashRecent": ["f07", "f08"],
    "flashIndex": 3,
    "flashRevealed": false
  }
}
JSON

python3 - "$TMP_DIR/valid.json" "$TMP_DIR/forged.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    payload = json.load(source)
payload["revision"] = 1
payload["state"]["flashAttempts"][0]["score"] = 76
with open(sys.argv[2], "w", encoding="utf-8") as target:
    json.dump(payload, target, separators=(",", ":"))
PY

printf '\n==> Isolated HTTP release\n'
python3 server.py \
  --host 127.0.0.1 \
  --port "$PORT" \
  --db "$TMP_DIR/release.db" \
  --static-root legacy/dist \
  > "$TMP_DIR/server.log" 2>&1 &
SERVER_PID="$!"

ready="false"
for _ in $(seq 1 40); do
  if curl -fsS "$BASE_URL/api/health/ready" > "$TMP_DIR/ready.json" 2>/dev/null; then
    ready="true"
    break
  fi
  sleep 0.25
done
if [ "$ready" != "true" ]; then
  cat "$TMP_DIR/server.log" >&2
  printf 'Isolated release server did not become ready.\n' >&2
  exit 1
fi

./scripts/smoke-production.sh "$BASE_URL"

save_status="$(curl -sS \
  -o "$TMP_DIR/saved.json" \
  -w '%{http_code}' \
  -X PUT \
  -H 'Content-Type: application/json' \
  -H "Origin: $BASE_URL" \
  -H 'If-Match: "state-local-r0"' \
  --data-binary "@$TMP_DIR/valid.json" \
  "$BASE_URL/api/state")"
test "$save_status" = "200"

curl -fsS "$BASE_URL/api/state?profile=local" > "$TMP_DIR/round-trip.json"
curl -fsS "$BASE_URL/api/export?profile=local" > "$TMP_DIR/export.json"
curl -fsS "$BASE_URL/api/diagnostics" > "$TMP_DIR/diagnostics.json"

python3 - "$TMP_DIR/round-trip.json" "$TMP_DIR/export.json" "$TMP_DIR/diagnostics.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    round_trip = json.load(source)
with open(sys.argv[2], encoding="utf-8") as source:
    exported = json.load(source)
with open(sys.argv[3], encoding="utf-8") as source:
    diagnostics = json.load(source)

assert round_trip["revision"] == 1
assert round_trip["state"]["flashAttempts"][0]["score"] == 75
assert round_trip["state"]["flashAttempts"][0]["answer"].startswith("Delayed data")
assert exported["state"] == round_trip["state"]
assert diagnostics["status"] == "ok"
assert diagnostics["integrity"] == "ok"
PY

forged_status="$(curl -sS \
  -o "$TMP_DIR/forged-response.json" \
  -w '%{http_code}' \
  -X PUT \
  -H 'Content-Type: application/json' \
  -H "Origin: $BASE_URL" \
  -H 'If-Match: "state-local-r1"' \
  --data-binary "@$TMP_DIR/forged.json" \
  "$BASE_URL/api/state")"
test "$forged_status" = "400"
python3 - "$TMP_DIR/forged-response.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as source:
    response = json.load(source)
assert "score must equal its rubric component total" in response["error"]
PY

printf 'getOPS release verification passed: %s\n' "$BASE_URL"
