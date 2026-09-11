FROM node:20-bookworm AS base
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
# prisma/ must be present before install: the postinstall script runs
# `prisma generate`. Separate COPY so the schema lands at ./prisma/schema.prisma
# and not at ./schema.prisma.
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm prisma generate && pnpm build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
ENV INVOICE_CHROMIUM_PATH=/usr/bin/chromium
# bookworm-slim ships no libssl, so Prisma can't detect the OpenSSL version
# and falls back to the 1.1.x engine (which isn't bundled — the client is
# generated for debian-openssl-3.0.x). Install openssl so it picks the right
# engine.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates chromium \
    && rm -rf /var/lib/apt/lists/*
# `output: "standalone"` already traces @prisma/client and its query engine
# into .next/standalone/node_modules (with pnpm the generated client lives in
# the virtual store, not at node_modules/.prisma, so it must not be copied by
# that path). The CI e2e job exercises Prisma queries against this bundle.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY entrypoint.sh ./
CMD ["./entrypoint.sh"]

FROM quay.io/minio/mc:RELEASE.2025-08-13T08-35-41Z@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727 AS minio-client

FROM base AS ops
# postgresql-client-16 from PGDG — the Debian 12 package is v15 and cannot
# pg_dump a Postgres 16 server (docs/phase-00 §10 requires client 16).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
         -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
         > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
         postgresql-client-16 zstd jq zip unzip file python3 \
    && rm -rf /var/lib/apt/lists/*
# Use the same digest-verified upstream client as minio-init; dl.min.io now returns 410.
COPY --from=minio-client /usr/bin/mc /usr/local/bin/mc
COPY --from=deps /app/node_modules ./node_modules
# Separate COPY lines: with multiple sources Docker copies the *contents* of
# each directory into ./, so `COPY package.json prisma scripts ./` would put
# schema.prisma at /app/schema.prisma and break `cd $APP_SRC && prisma migrate
# deploy` in restore.sh.
COPY package.json ./
COPY prisma ./prisma
COPY scripts ./scripts
CMD ["sleep", "infinity"]
