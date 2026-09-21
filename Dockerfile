# syntax=docker/dockerfile:1

# Node 24 is the current LTS line ("Krypton"). Every node in the cluster is arm64, so
# this image is built on native runners for both architectures rather than under QEMU.
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# The migrator runs before the server and imports drizzle-orm/node-postgres/migrator —
# a subpath the application itself never imports, so Next's file tracing does not carry
# it into the standalone output. It gets its own small production dependency set.
FROM node:24-slim AS migrate-deps
WORKDIR /migrate
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

COPY --from=migrate-deps /migrate/node_modules ./migrate/node_modules
COPY scripts/migrate.mjs ./migrate/migrate.mjs
COPY drizzle ./migrate/drizzle

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R node:node /app

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
