#!/usr/bin/env sh
set -eu

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
"$(dirname "$0")/compose.sh" exec -T origin python /app/server.py \
  --db /data/trading_ops_ascent.db \
  --backup "/data/backups/trading_ops_ascent-$STAMP.db"
