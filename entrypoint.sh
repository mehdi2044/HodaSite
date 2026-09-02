#!/usr/bin/env sh
set -eu
npx prisma migrate deploy
exec node server.js
