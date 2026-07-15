#!/usr/bin/env sh
set -eu

BASE_URL="${1:-http://127.0.0.1:8766}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsS "$BASE_URL/api/health/live" > "$TMP_DIR/live.json"
curl -fsS "$BASE_URL/api/health/ready" > "$TMP_DIR/ready.json"
curl -fsS -D "$TMP_DIR/index.headers" -o "$TMP_DIR/index.html" "$BASE_URL/"

ASSET_PATH="$(sed -n 's/.*src="\.\/assets\/\([^"]*\.js\)".*/\/assets\/\1/p' "$TMP_DIR/index.html" | head -1)"
test -n "$ASSET_PATH"
curl -fsS -D "$TMP_DIR/asset.headers" -o /dev/null "$BASE_URL$ASSET_PATH"
grep -qi 'cache-control: public, max-age=31536000, immutable' "$TMP_DIR/asset.headers"

curl -fsS -D "$TMP_DIR/state.headers" -o "$TMP_DIR/state.json" "$BASE_URL/api/state?profile=local"
ETAG="$(sed -n 's/^[Ee][Tt][Aa][Gg]:[[:space:]]*//p' "$TMP_DIR/state.headers" | tr -d '\r' | head -1)"
test -n "$ETAG"
STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -H "If-None-Match: $ETAG" "$BASE_URL/api/state?profile=local")"
test "$STATUS" = "304"

printf 'production smoke ok: %s\n' "$BASE_URL"
