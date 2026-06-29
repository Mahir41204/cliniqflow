# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:22 AS builder

WORKDIR /app

COPY package.json .
COPY pnpm-lock.yaml .
COPY pnpm-workspace.yaml .
COPY artifacts/api-server/package.json artifacts/api-server/
COPY lib/db/package.json lib/db/
COPY lib/api-zod/package.json lib/api-zod/

RUN corepack enable && pnpm install

COPY . .

WORKDIR /app/artifacts/api-server
RUN pnpm build


# ── Stage 2: migrate ──────────────────────────────────────────────────────────
FROM node:22 AS migrate

WORKDIR /app

COPY package.json .
COPY pnpm-lock.yaml .
COPY pnpm-workspace.yaml .
COPY artifacts/api-server/package.json artifacts/api-server/
COPY lib/db/package.json lib/db/
COPY lib/api-zod/package.json lib/api-zod/

# full install — keeps devDependencies so drizzle-kit is available
RUN corepack enable && pnpm install

# copy only the db package source (schema, migrations, drizzle.config.ts)
COPY lib/db ./lib/db

WORKDIR /app/lib/db
CMD ["pnpm", "drizzle-kit", "migrate"]


# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

WORKDIR /app

# create non-root user before copying anything
RUN groupadd --system appgroup && \
    useradd --system --gid appgroup appuser

COPY package.json .
COPY pnpm-lock.yaml .
COPY pnpm-workspace.yaml .
COPY artifacts/api-server/package.json artifacts/api-server/
COPY lib/db/package.json lib/db/
COPY lib/api-zod/package.json lib/api-zod/

RUN corepack enable && pnpm install --prod

# copy built output with correct ownership in one step
COPY --chown=appuser:appgroup --from=builder /app/artifacts/api-server/dist artifacts/api-server/dist

USER appuser

WORKDIR /app/artifacts/api-server
EXPOSE 3000
CMD ["node", "dist/index.mjs"]