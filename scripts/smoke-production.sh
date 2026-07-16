#!/usr/bin/env sh
set -eu

BASE_URL=${1:-http://127.0.0.1:8766}
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

curl --fail --silent --show-error "$BASE_URL/api/v1/health/live" >"$TMP_DIR/live.json"
curl --fail --silent --show-error "$BASE_URL/api/v1/health/ready" >"$TMP_DIR/ready.json"
curl --fail --silent --show-error "$BASE_URL/api/v1/diagnostics" >"$TMP_DIR/diagnostics.json"
curl --fail --silent --show-error \
  -D "$TMP_DIR/index.headers" \
  -o "$TMP_DIR/index.html" \
  "$BASE_URL/"

grep -q '<title>getOPS</title>' "$TMP_DIR/index.html"
ASSET_PATH=$(sed -n 's/.*src="\([^"]*\/assets\/[^"]*\.js\)".*/\1/p' "$TMP_DIR/index.html" | head -n 1)
test -n "$ASSET_PATH"
curl --fail --silent --show-error \
  -D "$TMP_DIR/asset.headers" \
  -o /dev/null \
  "$BASE_URL$ASSET_PATH"
grep -qi 'cache-control: public, max-age=31536000, immutable' "$TMP_DIR/asset.headers"

curl --fail --silent --show-error \
  -D "$TMP_DIR/state.headers" \
  -o "$TMP_DIR/state.json" \
  "$BASE_URL/api/v1/profiles/smoke-read/state"
ETAG=$(sed -n 's/^[Ee][Tt][Aa][Gg]:[[:space:]]*//p' "$TMP_DIR/state.headers" | tr -d '\r' | head -n 1)
test -n "$ETAG"
STATUS=$(curl --silent --show-error \
  -o /dev/null \
  -w '%{http_code}' \
  -H "If-None-Match: $ETAG" \
  "$BASE_URL/api/v1/profiles/smoke-read/state")
test "$STATUS" = "304"

curl --fail --silent --show-error "$BASE_URL/legacy/" >"$TMP_DIR/legacy.html"
grep -q '<title>Trading Ops Ascent</title>' "$TMP_DIR/legacy.html"

node -e '
  const fs = require("fs");
  const live = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const ready = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const diagnostics = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
  if (live.service !== "getops-api" || ready.database !== "ready") process.exit(1);
  if (!diagnostics.ready || diagnostics.schemaVersion < 1 || diagnostics.catalogCards !== 150) process.exit(1);
' "$TMP_DIR/live.json" "$TMP_DIR/ready.json" "$TMP_DIR/diagnostics.json"

printf 'React, C++ API, PostgreSQL, and legacy fallback smoke passed: %s\n' "$BASE_URL"
