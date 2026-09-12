#!/usr/bin/env bash
set -euo pipefail
mkdir -p "${BACKUP_ROOT:-/backups}"
# One worker for the shared backup volume. No DB transaction is held during restore.
exec flock -n "${BACKUP_ROOT:-/backups}/.ops.lock" node /app/scripts/ops/worker.mjs
