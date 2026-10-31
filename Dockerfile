FROM node:22-bookworm-slim

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace configuration and package manifests
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/markdown/package.json ./packages/markdown/package.json
COPY packages/permissions/package.json ./packages/permissions/package.json
COPY packages/protocol/package.json ./packages/protocol/package.json
COPY packages/snowflake/package.json ./packages/snowflake/package.json

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Copy source code
COPY packages ./packages
COPY apps/api ./apps/api

ENV NODE_ENV=production
EXPOSE 4000

CMD ["pnpm", "--filter", "@strata/api", "exec", "tsx", "src/index.ts"]

