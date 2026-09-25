FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf

RUN apk upgrade --no-cache
WORKDIR /app
COPY infra/google-cloud/dev-040-production-release/migration-runner/package.json infra/google-cloud/dev-040-production-release/migration-runner/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY scripts/lib/dev012-production-migration-runner.mjs scripts/lib/dev012-production-migration-runner.mjs
COPY scripts/dev040-production-migration-runner.mjs scripts/dev040-production-migration-runner.mjs
COPY scripts/dev057-production-principal-pair-diagnostic-runner.mjs scripts/dev057-production-principal-pair-diagnostic-runner.mjs

ARG SOURCE_REVISION
RUN echo "$SOURCE_REVISION" | grep -Eq '^[0-9a-f]{40}$'
ENV NODE_ENV=production SOURCE_REVISION=${SOURCE_REVISION}
LABEL org.opencontainers.image.source="https://github.com/jedchang0308-jenfu/OrgMaster" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      com.jenfu.orgmaster.operator="dev057-principal-pair-diagnostic"
USER node
ENTRYPOINT ["node", "scripts/dev057-production-principal-pair-diagnostic-runner.mjs"]
