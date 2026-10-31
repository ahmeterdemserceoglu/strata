FROM node:22-alpine

RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --no-frozen-lockfile

RUN pnpm --filter "./packages/**" run --if-present db:generate
RUN pnpm --filter "./packages/**" run --if-present build

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
EXPOSE 4000

CMD ["pnpm", "--filter", "@strata/api", "exec", "tsx", "src/index.ts"]
