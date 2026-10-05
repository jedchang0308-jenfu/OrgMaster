# Runtime-only, zero-database Directory readback. Reuse the verified
# OrgMaster runtime base; no new dependencies or private keys are installed.
FROM asia-east1-docker.pkg.dev/jenfu-platform-prod/orgmaster-release/orgmaster@sha256:9927dd5508f398d21e3ed6412845583ef49387aa8b5c628e41c99dd565b5ae92
ARG SOURCE_REVISION
ENV SOURCE_REVISION=${SOURCE_REVISION}
RUN ["/nodejs/bin/node", "-e", "if (!/^[a-f0-9]{40}$/.test(process.env.SOURCE_REVISION || '')) process.exit(1)"]
COPY --chown=65532:65532 scripts/dev014-directory-readback-canary.mjs /app/scripts/dev014-directory-readback-canary.mjs
LABEL com.jenfu.orgmaster.operator="dev014-directory-readback"
USER 65532:65532
ENTRYPOINT ["/nodejs/bin/node", "/app/scripts/dev014-directory-readback-canary.mjs"]
CMD []
