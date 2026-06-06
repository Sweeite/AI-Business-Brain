FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ── deps ──────────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/worker/package.json packages/worker/
RUN pnpm install --frozen-lockfile

# ── builder ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/core/node_modules packages/core/node_modules
COPY --from=deps /app/packages/worker/node_modules packages/worker/node_modules
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/worker packages/worker
RUN pnpm --filter @brain/worker build

# ── runner ────────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 worker

COPY --from=builder /app/packages/worker/dist packages/worker/dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/worker/node_modules packages/worker/node_modules

USER worker
CMD ["node", "packages/worker/dist/index.js"]
