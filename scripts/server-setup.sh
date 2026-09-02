#!/usr/bin/env bash
set -euo pipefail
command -v docker >/dev/null || { echo 'Install Docker Engine first'; exit 1; }
cp -n .env.example .env || true
echo 'Edit .env, then run docker compose up -d --build'
