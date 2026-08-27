# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/extension/package.json apps/extension/package.json
COPY packages/capture/package.json packages/capture/package.json
COPY packages/schema/package.json packages/schema/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
ARG DATABASE_URL
ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_URL
ARG GITHUB_CLIENT_ID
ARG GITHUB_CLIENT_SECRET
ARG GOOGLE_CLIENT_ID
ARG GOOGLE_CLIENT_SECRET
ARG EXTENSION_ORIGINS
ENV DATABASE_URL=$DATABASE_URL \
    BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET \
    BETTER_AUTH_URL=$BETTER_AUTH_URL \
    GITHUB_CLIENT_ID=$GITHUB_CLIENT_ID \
    GITHUB_CLIENT_SECRET=$GITHUB_CLIENT_SECRET \
    GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID \
    GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET \
    EXTENSION_ORIGINS=$EXTENSION_ORIGINS \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @transcriptly/web build

FROM node:22-alpine AS app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

FROM dependencies AS migrator
COPY tsconfig.base.json ./
COPY apps/web apps/web
WORKDIR /workspace/apps/web
CMD ["pnpm", "db:migrate"]
