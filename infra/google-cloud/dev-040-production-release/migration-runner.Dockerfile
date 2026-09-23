FROM node:24.20.0-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf

LABEL io.jenfu.dev014.admission-contract="source-bound-v1"

RUN apk upgrade --no-cache
WORKDIR /app
COPY infra/google-cloud/dev-040-production-release/migration-runner/package.json infra/google-cloud/dev-040-production-release/migration-runner/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY scripts/lib/dev012-production-migration-runner.mjs scripts/lib/dev012-production-migration-runner.mjs
COPY scripts/lib/dev012-orgmaster-production-data.mjs scripts/lib/dev012-orgmaster-production-data.mjs
COPY scripts/lib/dev049-production-admission.mjs scripts/lib/dev049-production-admission.mjs
COPY scripts/lib/dev014-consumer-conformance.mjs scripts/lib/dev014-consumer-conformance.mjs
COPY scripts/dev040-production-migration-runner.mjs scripts/dev040-production-migration-runner.mjs
COPY scripts/dev049-production-admission-runner.mjs scripts/dev049-production-admission-runner.mjs
COPY scripts/dev014-production-managed-link-runner.mjs scripts/dev014-production-managed-link-runner.mjs
COPY scripts/dev014-production-login-fixture-runner.mjs scripts/dev014-production-login-fixture-runner.mjs
COPY scripts/dev014-production-login-authority-switch-runner.mjs scripts/dev014-production-login-authority-switch-runner.mjs

USER node
ENV NODE_ENV=production
ENTRYPOINT ["node", "scripts/dev040-production-migration-runner.mjs"]
