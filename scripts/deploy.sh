#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--rollback" ]]; then docker compose pull app && docker compose up -d app; exit; fi
docker compose run --rm ops /app/scripts/backup/backup.sh --kind safety --label pre-deploy
docker compose pull
docker compose build
docker compose up -d
