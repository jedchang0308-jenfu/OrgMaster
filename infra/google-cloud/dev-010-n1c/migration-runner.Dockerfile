ARG NODE_IMAGE=node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532

FROM ${NODE_IMAGE} AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM ${NODE_IMAGE} AS runner
ARG SOURCE_REVISION
WORKDIR /app
ENV NODE_ENV=production \
    DEV010_N1C_SOURCE_REVISION=${SOURCE_REVISION}
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs orgmaster-migrator
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/package.json /app/package-lock.json ./
COPY --chown=orgmaster-migrator:nodejs config/dev-010/n1c-orgmaster.json ./config/dev-010/n1c-orgmaster.json
COPY --chown=orgmaster-migrator:nodejs db/migrations ./db/migrations
COPY --chown=orgmaster-migrator:nodejs scripts/lib/dev010-n2-manifest.mjs ./scripts/lib/dev010-n2-manifest.mjs
COPY --chown=orgmaster-migrator:nodejs scripts/dev010-n1c-orgmaster-package.mjs ./scripts/dev010-n1c-orgmaster-package.mjs
USER orgmaster-migrator
CMD ["node", "scripts/dev010-n1c-orgmaster-package.mjs"]
