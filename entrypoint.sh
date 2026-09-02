#!/usr/bin/env sh
set -eu
# Migrations run in a dedicated one-shot container built from the `ops` stage
# (it ships the full Prisma CLI); see the `migrate` service in
# docker-compose.yml and step 6 of scripts/backup/restore.sh. The runner image
# is the standalone build and has no Prisma CLI, so it only starts the server.
exec node server.js
