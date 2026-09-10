#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR=${GETOPS_BACKUP_DIR:-"$ROOT_DIR/backups"}
BACKUP_PATH="$BACKUP_DIR/getops-$STAMP.dump"

mkdir -p "$BACKUP_DIR"
"$ROOT_DIR/scripts/compose.sh" exec -T db \
  pg_dump \
    --username getops \
    --dbname getops \
    --format custom \
    --compress 9 \
    --no-owner \
    --no-privileges >"$BACKUP_PATH"

if [ ! -s "$BACKUP_PATH" ]; then
  rm -f "$BACKUP_PATH"
  printf 'PostgreSQL backup is empty.\n' >&2
  exit 1
fi

printf 'PostgreSQL backup written: %s\n' "$BACKUP_PATH"
