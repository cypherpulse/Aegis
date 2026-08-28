# Aegis API (+ background monitor) production image.
# The monorepo runs TypeScript directly via tsx, so this is a single-stage
# image: install workspace deps, then run migrations and start the API.
FROM node:22.13-slim

WORKDIR /app

# pnpm via corepack (pinned to the repo's packageManager).
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

# Install dependencies first (better layer caching).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages ./packages
RUN pnpm install --frozen-lockfile

# App source.
COPY . .

ENV NODE_ENV=production
ENV API_PORT=4000
EXPOSE 4000

# Apply migrations, then launch the API (the monitor starts when MONITOR_ENABLED=true).
CMD ["sh", "-c", "pnpm --filter @aegis/database db:migrate && pnpm --filter @aegis/api start"]
