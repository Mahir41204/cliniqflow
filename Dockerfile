FROM node:22

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

CMD [ "pnpm" , "start" ]