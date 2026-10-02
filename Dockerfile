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
COPY --chmod=755 entrypoint.sh ./
RUN sed -i 's/\r$//' /app/entrypoint.sh
CMD ["./entrypoint.sh"]

# D68: upstream registries no longer serve the pinned client image.
FROM golang:1.27.1-bookworm AS minio-client-build
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
RUN go install github.com/minio/mc@7394ce0dd2a80935aded936b09fa12cbb3cb8096 \
    && module_dir="$(go list -m -f '{{.Dir}}' github.com/minio/mc@7394ce0dd2a80935aded936b09fa12cbb3cb8096)" \
    && cp "$module_dir/LICENSE" /MC-LICENSE

FROM debian:bookworm-slim AS minio-client
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=minio-client-build /go/bin/mc /usr/local/bin/mc
COPY --from=minio-client-build /MC-LICENSE /usr/share/licenses/mc/LICENSE
LABEL org.opencontainers.image.source="https://github.com/minio/mc" \
      org.opencontainers.image.revision="7394ce0dd2a80935aded936b09fa12cbb3cb8096" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
ENTRYPOINT ["/usr/local/bin/mc"]

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
         postgresql-client-16 zstd jq zip unzip file python3 util-linux \
    && rm -rf /var/lib/apt/lists/*
# Use the same checksum-verified upstream source as minio-init (D68).
COPY --from=minio-client /usr/local/bin/mc /usr/local/bin/mc
COPY --from=minio-client /usr/share/licenses/mc /usr/share/licenses/mc
COPY --from=deps /app/node_modules ./node_modules
# Separate COPY lines: with multiple sources Docker copies the *contents* of
# each directory into ./, so `COPY package.json prisma scripts ./` would put
# schema.prisma at /app/schema.prisma and break `cd $APP_SRC && prisma migrate
# deploy` in restore.sh.
COPY package.json ./
COPY prisma ./prisma
COPY scripts ./scripts
# Defense in depth for archives/old Windows checkouts bypassing .gitattributes.
RUN find /app/scripts -type f -name '*.sh' -exec sed -i 's/\r$//' {} + \
    && find /app/scripts -type f -name '*.sh' -exec chmod 755 {} +
CMD ["bash", "/app/scripts/ops/run.sh"]
