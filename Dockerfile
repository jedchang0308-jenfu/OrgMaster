ARG NODE_IMAGE=node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532
ARG SOURCE_REVISION=unknown
ARG SOURCE_TREE=unknown
ARG SOURCE_CREATED_AT=1970-01-01T00:00:00Z
ARG SOURCE_VERSION=unversioned
ARG SOURCE_STATE=unknown

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM ${NODE_IMAGE} AS runner
ARG SOURCE_REVISION
ARG SOURCE_TREE
ARG SOURCE_CREATED_AT
ARG SOURCE_VERSION
ARG SOURCE_STATE
WORKDIR /app
ENV NODE_ENV=production \
    ORGMASTER_HOST=0.0.0.0 \
    ORGMASTER_PERSISTENCE_MODE=cloud-sql \
    PORT=8080
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs orgmaster
LABEL org.opencontainers.image.title="OrgMaster" \
      org.opencontainers.image.source="urn:jenfu:source:orgmaster" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.created="${SOURCE_CREATED_AT}" \
      org.opencontainers.image.version="${SOURCE_VERSION}" \
      com.jenfu.source-tree="${SOURCE_TREE}" \
      com.jenfu.source-state="${SOURCE_STATE}"
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=orgmaster:nodejs /app/dist ./dist
COPY --from=builder --chown=orgmaster:nodejs /app/dist-server ./dist-server
COPY --from=builder --chown=orgmaster:nodejs /app/contracts ./contracts
USER orgmaster
EXPOSE 8080
CMD ["node", "dist-server/server.mjs"]
