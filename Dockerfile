# Aegis API (+ background monitor) production image.
# The monorepo runs TypeScript directly via tsx, so this is a single-stage
# image: install workspace deps, then run migrations and start the API.
FROM node:22.13-slim

WORKDIR /app

# pnpm via corepack (pinned to the repo's packageManager).
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

# Copy the whole workspace, then install. Every workspace member's manifest
# (apps/*, packages/*, and the root-level `simulator` package) must be present
# for `pnpm install --frozen-lockfile` to resolve the workspace: dependencies.
COPY . .
RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
ENV API_PORT=4000
EXPOSE 4000

# Apply migrations, then launch the API (the monitor starts when MONITOR_ENABLED=true).
CMD ["sh", "-c", "pnpm --filter @aegis/database db:migrate && pnpm --filter @aegis/api start"]
