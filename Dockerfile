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

FROM node:22-slim AS runtime

WORKDIR /app

COPY package.json .
COPY pnpm-lock.yaml .
COPY pnpm-workspace.yaml .
COPY artifacts/api-server/package.json artifacts/api-server/
COPY lib/db/package.json lib/db/
COPY lib/api-zod/package.json lib/api-zod/

RUN corepack enable && pnpm install --prod

COPY --from=builder app/artifacts/api-server/dist artifacts/api-server/dist


WORKDIR /app/artifacts/api-server

CMD [ "node" , "dist/index.mjs" ]