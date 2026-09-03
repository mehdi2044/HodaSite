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
ENV NODE_ENV=production
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

FROM base AS ops
RUN apt-get update \
    && apt-get install -y postgresql-client zstd jq zip unzip file curl python3 \
    && rm -rf /var/lib/apt/lists/* \
    # mc (MinIO client) for the off-site backup mirror (docs/phase-00 §10)
    && curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc \
    && chmod +x /usr/local/bin/mc
COPY --from=deps /app/node_modules ./node_modules
# Separate COPY lines: with multiple sources Docker copies the *contents* of
# each directory into ./, so `COPY package.json prisma scripts ./` would put
# schema.prisma at /app/schema.prisma and break `cd $APP_SRC && prisma migrate
# deploy` in restore.sh.
COPY package.json ./
COPY prisma ./prisma
COPY scripts ./scripts
CMD ["sleep", "infinity"]
