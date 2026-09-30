ARG NODE_IMAGE=node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532
ARG RUNTIME_NODE_IMAGE=gcr.io/distroless/nodejs24-debian13:nonroot-amd64@sha256:7924c53f56526359d0f491c22517306d8d92f1b285656a6094398e2c55bbaeca
ARG RUNTIME_SANITIZER_IMAGE=alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce
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

FROM ${RUNTIME_NODE_IMAGE} AS runtime-base

FROM ${NODE_IMAGE} AS runtime-security-packages
RUN printf '%s\n' 'deb https://security.debian.org/debian-security trixie-security main' > /tmp/runtime-security.list \
    && apt-get -o Dir::Etc::sourcelist=/tmp/runtime-security.list -o Dir::Etc::sourceparts=- update \
    && cd /tmp \
    && apt-get -o Dir::Etc::sourcelist=/tmp/runtime-security.list -o Dir::Etc::sourceparts=- download libssl3t64=3.5.7-1~deb13u3 \
    && printf '%s\n' 'ff16bc048bcd7d1b256094450b79c77947d8e76fe2a24bd99b91021d591fa074  /tmp/libssl3t64_3.5.7-1~deb13u3_amd64.deb' | sha256sum -c - \
    && test "$(dpkg-deb -f /tmp/libssl3t64_3.5.7-1~deb13u3_amd64.deb Package)" = libssl3t64 \
    && test "$(dpkg-deb -f /tmp/libssl3t64_3.5.7-1~deb13u3_amd64.deb Version)" = 3.5.7-1~deb13u3 \
    && dpkg-deb -x /tmp/libssl3t64_3.5.7-1~deb13u3_amd64.deb /patch-rootfs \
    && dpkg-deb -e /tmp/libssl3t64_3.5.7-1~deb13u3_amd64.deb /package-metadata \
    && mkdir -p /patch-rootfs/var/lib/dpkg/status.d \
    && { printf '%s\n' 'Status: install ok installed'; cat /package-metadata/control; } > /patch-rootfs/var/lib/dpkg/status.d/libssl3t64 \
    && cp /package-metadata/md5sums /patch-rootfs/var/lib/dpkg/status.d/libssl3t64.md5sums

FROM ${RUNTIME_SANITIZER_IMAGE} AS runtime-sanitizer
COPY --from=runtime-base / /rootfs
COPY --from=runtime-security-packages /patch-rootfs/ /rootfs/
RUN rm -f \
      /rootfs/usr/lib/x86_64-linux-gnu/libz.so.1 \
      /rootfs/usr/lib/x86_64-linux-gnu/libz.so.1.3.1 \
      /rootfs/var/lib/dpkg/status.d/zlib1g \
      /rootfs/var/lib/dpkg/status.d/zlib1g.md5sums \
    && test ! -e /rootfs/usr/lib/x86_64-linux-gnu/libz.so.1 \
    && test ! -e /rootfs/usr/lib/x86_64-linux-gnu/libz.so.1.3.1 \
    && test ! -e /rootfs/var/lib/dpkg/status.d/zlib1g \
    && test ! -e /rootfs/var/lib/dpkg/status.d/zlib1g.md5sums

FROM scratch AS runtime-smoke
COPY --from=runtime-sanitizer /rootfs /
COPY scripts/dev015-runtime-security-smoke.mjs /runtime-smoke.mjs
USER 65532:65532
RUN ["/nodejs/bin/node", "/runtime-smoke.mjs"]

FROM scratch AS runner
COPY --from=runtime-sanitizer /rootfs /
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
LABEL org.opencontainers.image.title="OrgMaster" \
      org.opencontainers.image.source="urn:jenfu:source:orgmaster" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.created="${SOURCE_CREATED_AT}" \
      org.opencontainers.image.version="${SOURCE_VERSION}" \
      com.jenfu.source-tree="${SOURCE_TREE}" \
      com.jenfu.source-state="${SOURCE_STATE}"
COPY --from=production-dependencies --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=65532:65532 /app/package.json ./
COPY --from=builder --chown=65532:65532 /app/dist ./dist
COPY --from=builder --chown=65532:65532 /app/dist-server ./dist-server
COPY --from=builder --chown=65532:65532 /app/contracts ./contracts
COPY --from=builder --chown=65532:65532 /app/config/catalogs/ai-pdm-role-catalog.v4.json ./config/catalogs/ai-pdm-role-catalog.v4.json
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/nodejs/bin/node"]
CMD ["dist-server/server.mjs"]
