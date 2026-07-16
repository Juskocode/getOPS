#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

step() {
  printf '\n==> %s\n' "$1"
}

step "Toolchain"
for command_name in cmake git node npm python3; do
  command -v "$command_name" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  }
done

node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$node_major" -lt 22 ]; then
  printf 'Node.js 22 or newer is required; found %s\n' "$(node --version)" >&2
  exit 1
fi
printf 'Node %s | %s | %s\n' \
  "$(node --version)" \
  "$(python3 --version)" \
  "$(cmake --version | head -n 1)"

step "Repository hygiene"
tracked_runtime="$(git ls-files 'data/*' 'dist/*' 'legacy/dist/*' 'apps/*/dist/*' 'services/*/build/*' 'node_modules/*' 'index.html' 'index.html.gz' | grep -v '^data/.gitkeep$' || true)"
if [ -n "$tracked_runtime" ]; then
  printf 'Generated or runtime paths are tracked:\n%s\n' "$tracked_runtime" >&2
  exit 1
fi
git diff --check
printf 'Runtime state and generated releases are excluded from Git.\n'

step "Frontend and release contracts"
npm test
node -e '
  const fs = require("node:fs");
  const manifest = JSON.parse(fs.readFileSync("legacy/dist/asset-manifest.json", "utf8"));
  if (typeof manifest.release !== "string" || !manifest.release) throw new Error("manifest.release is missing");
  for (const key of ["css", "js"]) {
    if (typeof manifest.assets?.[key] !== "string" || !manifest.assets[key]) throw new Error(`manifest.assets.${key} is missing`);
  }
  for (const relative of ["index.html", "service-worker.js", `assets/${manifest.assets.css}`, `assets/${manifest.assets.js}`]) {
    if (!fs.statSync(`legacy/dist/${relative}`).size) throw new Error(`${relative} is empty`);
  }
  process.stdout.write(`Release ${manifest.release} has complete content-addressed assets.\n`);
'

step "Backend and persistence contracts"
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s legacy/tests -p 'test_*.py' -v

if command -v docker >/dev/null 2>&1 && "$ROOT_DIR/scripts/compose.sh" version >/dev/null 2>&1; then
  step "Compose model"
  "$ROOT_DIR/scripts/compose.sh" config -q
else
  printf '\nDocker Compose unavailable; skipped container model validation.\n'
fi

printf '\ngetOPS doctor passed.\n'
