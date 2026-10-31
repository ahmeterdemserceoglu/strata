FROM node:22-alpine

RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@12.16.1 --activate

WORKDIR /app

COPY package.json pnpm-workspace.yaml tsconfig.json turbo.json ./
COPY packages/config/package.json ./packages/config/
COPY packages/shared/package.json ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --no-frozen-lockfile

COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm --filter @strata/database exec prisma generate
RUN pnpm --filter @strata/config build && pnpm --filter @strata/shared build && pnpm --filter @strata/database build

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
EXPOSE 4000

CMD ["pnpm", "--filter", "@strata/api", " exec", "tsx", "src/index.ts"]
