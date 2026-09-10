#!/usr/bin/env sh
set -eu

LEGACY_BASE_URL=${1:-http://127.0.0.1:8766}
TARGET_BASE_URL=${2:-http://127.0.0.1:8768}
PROFILE=${3:-local}

case "$PROFILE" in
  *[!A-Za-z0-9_-]*|"")
    printf 'Profile must match [A-Za-z0-9_-]{1,40}.\n' >&2
    exit 2
    ;;
esac
if [ "${#PROFILE}" -gt 40 ]; then
  printf 'Profile must match [A-Za-z0-9_-]{1,40}.\n' >&2
  exit 2
fi

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT INT TERM

SOURCE_PATH="$TMP_DIR/legacy-export.json"
IMPORT_PATH="$TMP_DIR/import.json"
TARGET_PATH="$TMP_DIR/target.json"
RESPONSE_PATH="$TMP_DIR/import-response.json"

curl --fail --silent --show-error \
  "$LEGACY_BASE_URL/api/export?profile=$PROFILE" >"$SOURCE_PATH"

node - "$SOURCE_PATH" "$IMPORT_PATH" <<'NODE'
const fs = require("node:fs");

const source = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!source || typeof source !== "object" || !source.state || typeof source.state !== "object") {
  throw new Error("Legacy export does not contain an object state.");
}
fs.writeFileSync(process.argv[3], JSON.stringify({ state: source.state }));
NODE

STATUS=$(curl --silent --show-error \
  -o "$RESPONSE_PATH" \
  -w '%{http_code}' \
  -X POST \
  -H 'Content-Type: application/json' \
  --data-binary "@$IMPORT_PATH" \
  "$TARGET_BASE_URL/api/v1/profiles/$PROFILE/import")

if [ "$STATUS" != "201" ]; then
  printf 'Legacy import failed with HTTP %s. Target profiles must be empty.\n' "$STATUS" >&2
  cat "$RESPONSE_PATH" >&2
  printf '\n' >&2
  exit 1
fi

curl --fail --silent --show-error \
  "$TARGET_BASE_URL/api/v1/profiles/$PROFILE/state" >"$TARGET_PATH"

node - "$SOURCE_PATH" "$TARGET_PATH" <<'NODE'
const fs = require("node:fs");

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

const source = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const target = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
const expected = JSON.stringify(canonical(source.state));
const actual = JSON.stringify(canonical(target.state));
if (expected !== actual) {
  throw new Error("Imported PostgreSQL state differs from the legacy export.");
}
if (target.revision !== 1) {
  throw new Error(`Expected imported revision 1, received ${target.revision}.`);
}
NODE

printf 'Legacy profile %s imported and canonically verified at PostgreSQL revision 1.\n' "$PROFILE"
