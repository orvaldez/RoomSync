# RoomSync API (#116). Two stages: build compiles the TypeScript with every
# dependency installed; runtime keeps only production dependencies, the
# compiled code and the Prisma schema and migrations, and runs as a non-root
# user.
#
# Built by `docker compose up --build` from the repo root, and the image
# Render deploys (#117).

# Node 20, the version CI tests on (.github/workflows/ci.yml).
ARG NODE_IMAGE=node:20-bookworm-slim

# ---- base -------------------------------------------------------------------
# Prisma's migration engine links against OpenSSL, which the slim image
# leaves out; without it Prisma warns and guesses a version.
FROM ${NODE_IMAGE} AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# ---- build ------------------------------------------------------------------
FROM base AS build
WORKDIR /app

# prisma.config.ts resolves DATABASE_URL whenever the Prisma CLI loads,
# including for `prisma generate`, which never connects. Same as CI.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json ./
RUN npx prisma generate

COPY src ./src
RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
# Production dependencies only. `prisma` is one, because the container runs
# `prisma migrate deploy` itself before starting (below).
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate

COPY --from=build /app/dist ./dist

# The official image's unprivileged user. Nothing under /app needs writing.
USER node

EXPOSE 4000

# Docker's own check, used by Compose to start the client only once the API
# answers. Node 20 has fetch built in, so no curl is needed in the image.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://localhost:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Migrations first, then the server. `migrate deploy` only applies migrations
# that haven't run, never resets or generates, so it's safe on every start.
# `exec` replaces the shell with node, so node itself receives the SIGTERM
# from `docker compose down` and stops at once.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/index.js"]
