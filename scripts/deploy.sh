#!/usr/bin/env bash
# Host-side deploy: safety backup -> pull -> build -> up.
# The `migrate` one-shot service (ops image) applies migrations before `app`
# starts (see docker-compose.yml).
#
# Rollback is NOT implemented here — it needs per-deploy image tags plus a
# restore from the pre-deploy safety backup, and lands with Backup/Restore in
# Phase 05. Until then, recover with scripts/backup/restore.sh inside `ops`.
set -euo pipefail

docker compose run --rm ops /app/scripts/backup/backup.sh --kind safety --label pre-deploy
docker compose pull
docker compose build
docker compose up -d
