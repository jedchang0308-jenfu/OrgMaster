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
COPY scripts/dev057-production-v4-catalog-readback-runner.mjs scripts/dev057-production-v4-catalog-readback-runner.mjs
COPY server/aiPdmRoleCatalogRepository.ts server/aiPdmRoleCatalogRepository.ts
COPY config/catalogs/ai-pdm-role-catalog.v4.json config/catalogs/ai-pdm-role-catalog.v4.json
COPY contracts/jenfu-platform-entitlement/v1/fixtures/application-role-catalog.sample.json contracts/jenfu-platform-entitlement/v1/fixtures/application-role-catalog.sample.json

ARG SOURCE_REVISION
RUN echo "$SOURCE_REVISION" | grep -Eq '^[0-9a-f]{40}$'
ENV NODE_ENV=production SOURCE_REVISION=${SOURCE_REVISION}
LABEL org.opencontainers.image.source="https://github.com/jedchang0308-jenfu/OrgMaster" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      com.jenfu.orgmaster.operator="dev057-v4-consumer-readback"
USER node
ENTRYPOINT ["node", "--experimental-transform-types", "scripts/dev057-production-v4-catalog-readback-runner.mjs"]
